import { defineRules, type Fields } from '../core/index.js';
import {
  aspectRatioCodec,
  createControlNetsKit,
  sliderCodec,
  type AspectRatioOption,
} from '../codecs/index.js';
import { fluxVersionIds, type GenerationExt } from './config.js';
import { checkpointKit, collectTriggerWords, groupOf, resourcesKit, SEED, textSection } from './shared.js';

/**
 * Port of flux-graph.ts: fluxMode computed from the model version id, mode
 * branches as a switch, and the draft workflow<->model coupling as one rule.
 * Flux has no negative prompt, sampler, or clip skip.
 */

export type FluxMode = 'draft' | 'standard' | 'pro' | 'krea' | 'ultra';

const versionIdToMode = new Map<number, FluxMode>(
  Object.entries(fluxVersionIds).map(([mode, id]) => [id, mode as FluxMode])
);

// The REAL sdxlAspectRatioBuckets (generation.constants.ts) — the parity test
// proved even the closest-match leniency only agrees when the tables agree
// (v1 resolves '16:9' to '3:2' because there IS no 16:9 bucket).
const sdxlAspectRatios: AspectRatioOption[] = [
  { label: '2:3', value: '2:3', width: 832, height: 1216 },
  { label: '1:1', value: '1:1', width: 1024, height: 1024 },
  { label: '3:2', value: '3:2', width: 1216, height: 832 },
];

const fluxUltraAspectRatios: AspectRatioOption[] = [
  { label: '21:9', value: '21:9', width: 3136, height: 1344 },
  { label: '16:9', value: '16:9', width: 2752, height: 1536 },
  { label: '1:1', value: '1:1', width: 2048, height: 2048 },
  { label: '9:16', value: '9:16', width: 1536, height: 2752 },
];

const fluxGuidancePresets = [
  { label: 'Low', value: 2 },
  { label: 'Balanced', value: 3.5 },
  { label: 'High', value: 7 },
];

const AR_STANDARD = aspectRatioCodec({ options: sdxlAspectRatios, default: '1:1' });
const AR_ULTRA = aspectRatioCodec({ options: fluxUltraAspectRatios, default: '1:1' });
const CFG = sliderCodec({ min: 2, max: 20, default: 3.5, step: 0.5, presets: fluxGuidancePresets });
const STEPS = sliderCodec({ min: 20, max: 50, default: 25 });
const FLUX_ULTRA_RAW = sliderCodec({ min: 0, max: 1, default: 0 });

const checkpoint = checkpointKit({
  versions: {
    options: [
      { label: 'Draft', value: fluxVersionIds.draft },
      { label: 'Standard', value: fluxVersionIds.standard },
      { label: 'Krea', value: fluxVersionIds.krea },
      { label: 'Pro 1.1', value: fluxVersionIds.pro },
      { label: 'Ultra', value: fluxVersionIds.ultra },
    ],
  },
  defaultModelId: fluxVersionIds.standard,
  appliesTo: (state) => state.ecosystem === 'Flux1',
});

const controlNets = createControlNetsKit({
  registry: {
    canny: { label: 'Canny', description: 'Edge detection', category: 'edges' },
    depth: { label: 'Depth', description: 'Depth map', category: 'depth' },
  },
  categoryLabels: { edges: 'Edges', depth: 'Depth' },
  preprocessors: ['canny', 'depth'],
  limit: 1,
});

export function fluxResolver(
  f: Fields,
  ext: GenerationExt,
  ctx: { workflow: string; ecosystem: string }
) {
  const scope = groupOf(ctx.ecosystem);
  // Draft is a locked build with its own default — v1 reaches the same state
  // through an effect; the pure parse path needs it as the default.
  const draft = ctx.workflow === 'txt2img:draft';
  const model = checkpoint.field(f, {
    ctx,
    scope,
    modelLocked: draft ? true : undefined,
    defaultModelId: draft ? fluxVersionIds.draft : undefined,
    gatedVersionIds: undefined,
  });

  const fluxMode: FluxMode = versionIdToMode.get(model?.id ?? -1) ?? 'standard';
  f.computed('fluxMode', fluxMode);

  const base = {
    ecosystem: 'Flux1' as const,
    model,
    fluxMode,
    seed: f.field('seed', SEED),
  };
  const text = (resources: Parameters<typeof collectTriggerWords>[1] = []) =>
    textSection(f, { promptRequired: true, triggerWords: collectTriggerWords(model, resources) });

  switch (fluxMode) {
    case 'draft':
      return { ...base, ...text(), aspectRatio: f.field('aspectRatio', AR_STANDARD, { scope }) };
    case 'ultra':
      return {
        ...base,
        ...text(),
        aspectRatio: f.field('aspectRatio', AR_ULTRA, { scope: [scope, 'ultra'] }),
        fluxUltraRaw: f.field('fluxUltraRaw', FLUX_ULTRA_RAW),
      };
    case 'pro':
      return {
        ...base,
        ...text(),
        aspectRatio: f.field('aspectRatio', AR_STANDARD, { scope }),
        cfgScale: f.field('cfgScale', CFG, { scope }),
        steps: f.field('steps', STEPS, { scope }),
      };
    default: {
      // standard, krea — one code path IS the grouping
      const resources = resourcesKit.field(f, {
        ecosystem: ctx.ecosystem,
        limit: ext.limits.maxResources,
        scope,
      });
      const common = {
        ...base,
        ...text(resources),
        aspectRatio: f.field('aspectRatio', AR_STANDARD, { scope }),
        cfgScale: f.field('cfgScale', CFG, { scope }),
        steps: f.field('steps', STEPS, { scope }),
        resources,
      };
      if (ctx.workflow === 'txt2img') {
        return { ...common, controlNets: controlNets.field(f, undefined) };
      }
      return common;
    }
  }
}

type FluxRuleState = { workflow?: string; ecosystem?: string; model?: { id?: number } };
const build = (id: number) => ({ id, model: { type: 'Checkpoint' } });

/** The draft workflow<->model coupling — v1's two mutually-guarded effects. */
const createFluxCoupling = defineRules<void, FluxRuleState>({
  scope: (state) => state.ecosystem === 'Flux1',
  rules: () => ({
    workflow: (workflow: string, { patch, state }) => {
      if ('model' in patch) return; // the model rule owns mixed patches
      const model = state.model?.id;
      if (workflow === 'txt2img:draft' && model !== fluxVersionIds.draft) {
        return { model: build(fluxVersionIds.draft) };
      }
      if (workflow !== 'txt2img:draft' && model === fluxVersionIds.draft) {
        return { model: build(fluxVersionIds.standard) };
      }
    },
    model: (model: { id?: number } | undefined, { state }) => {
      if (model?.id === fluxVersionIds.draft && state.workflow !== 'txt2img:draft') {
        return { workflow: 'txt2img:draft' };
      }
      if (model?.id !== fluxVersionIds.draft && state.workflow === 'txt2img:draft') {
        return { workflow: 'txt2img' };
      }
    },
  }),
});

export const fluxCoupling = createFluxCoupling();
export const fluxCheckpoint = checkpoint;
