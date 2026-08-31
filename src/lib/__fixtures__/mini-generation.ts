import { z } from 'zod';
import { codec } from '../core/codec.js';
import { defineForm } from '../core/form.js';
import { type Fields } from '../core/resolve.js';
import type { PatchReconciler } from '../core/store.js';

/**
 * A compact stand-in for the real generation graph, built to exercise every
 * mechanism the engine has to support: nested branching (workflow -> ecosystem ->
 * fluxMode), a computed that drives a branch, a conditional field, dynamic meta
 * from ext, boundary migration of a renamed value, and a patch reconciler
 * modelled on flux's draft/model coupling.
 */

export type MiniExt = {
  limits: { maxResources: number };
  tier: 'free' | 'gold';
};

const MAX_SEED = 4294967295;

const WORKFLOWS = ['image:create', 'image:draft', 'image:upscale', 'video:create'] as const;
export type Workflow = (typeof WORKFLOWS)[number];

/** Mirrors migrateWorkflowKey: old stored keys map onto current ones. */
const WORKFLOW_ALIASES: Record<string, Workflow> = {
  txt2img: 'image:create',
  'txt2img:draft': 'image:draft',
  txt2vid: 'video:create',
};

const workflowCodec = codec<Workflow, { options: readonly Workflow[] }>({
  output: z.enum(WORKFLOWS),
  input: z
    .string()
    .optional()
    .transform((raw): Workflow | undefined => {
      if (!raw) return undefined;
      const migrated = WORKFLOW_ALIASES[raw] ?? raw;
      return (WORKFLOWS as readonly string[]).includes(migrated)
        ? (migrated as Workflow)
        : 'image:create';
    }),
  default: 'image:create',
  meta: { options: WORKFLOWS },
});

const ECOSYSTEMS = ['Flux', 'SD'] as const;
export type Ecosystem = (typeof ECOSYSTEMS)[number];

const ecosystemCodec = codec<Ecosystem, { options: readonly Ecosystem[] }>({
  output: z.enum(ECOSYSTEMS),
  default: 'Flux',
  meta: { options: ECOSYSTEMS },
});

const MODELS = ['flux-standard', 'flux-draft', 'sd-xl'] as const;
export type Model = (typeof MODELS)[number];

const modelCodec = codec<Model>({
  output: z.enum(MODELS),
  default: 'flux-standard',
});

const promptCodec = codec<string>({
  output: z.string().min(1, 'Prompt is required'),
  input: z.coerce.string().optional(),
  default: '',
});

const seedCodec = codec<number | undefined>({
  output: z.number().int().min(1).max(MAX_SEED).optional(),
  // Accepts null (how the UI clears it) and numeric strings (URL params).
  input: z
    .union([z.null(), z.coerce.number().int()])
    .optional()
    .transform((v) => v ?? undefined),
});

export interface NumberMeta {
  min: number;
  max: number;
  step: number;
}

export function numberCodec(opts: { min: number; max: number; step?: number; default: number }) {
  const step = opts.step ?? 1;
  const snap = (v: number) => Math.min(opts.max, Math.max(opts.min, Math.round(v / step) * step));

  return codec<number, NumberMeta>({
    output: z.number().min(opts.min).max(opts.max),
    input: z.coerce.number().optional(),
    default: opts.default,
    // Trusted set() writes skip schemas entirely, so step snapping is opt-in here.
    coerce: (raw) => snap(Number(raw)),
    meta: { min: opts.min, max: opts.max, step },
  });
}

/**
 * Codecs are built ONCE, at module scope. Building them inside a resolver makes
 * every pass construct fresh zod schemas — measured at 152x the keystroke cost.
 */
const FLUX_STEPS = numberCodec({ min: 1, max: 50, default: 25 });
const SD_STEPS = numberCodec({ min: 1, max: 150, default: 20 });
const CFG_SCALE = numberCodec({ min: 1, max: 30, step: 0.5, default: 7 });
const UPSCALE_SCALE = numberCodec({ min: 2, max: 4, default: 2 });

const samplerCodec = codec<string, { options: string[] }>({
  output: z.string(),
  default: 'euler',
  meta: { options: ['euler', 'dpm++'] },
});

const resourcesCodec = codec<string[], { limit: number }>({
  output: z.array(z.string()),
  input: z.array(z.string()).optional(),
  default: [],
});

const aspectRatioCodec = codec<string, { options: string[] }>({
  output: z.enum(['1:1', '16:9', '9:16']),
  default: '1:1',
  meta: { options: ['1:1', '16:9', '9:16'] },
});

const upscalerCodec = codec<string>({
  output: z.enum(['esrgan', 'ultrasharp']),
  default: 'esrgan',
});

// ---------------------------------------------------------------------------
// Sections — plain functions. These replace v1's subgraph templates + .merge().
// ---------------------------------------------------------------------------

function ecosystemSection(f: Fields, ext: MiniExt, workflow: Workflow) {
  const ecosystem = f.field('ecosystem', ecosystemCodec);
  const model = f.field('model', modelCodec);
  const seed = f.field('seed', seedCodec);

  switch (ecosystem) {
    case 'Flux': {
      const fluxMode = f.computed(
        'fluxMode',
        model === 'flux-draft' ? ('draft' as const) : ('standard' as const)
      );
      const fluxBase = {
        ecosystem: 'Flux' as const,
        model,
        seed,
        aspectRatio: f.field('aspectRatio', aspectRatioCodec),
      };

      if (fluxMode === 'draft') {
        return { ...fluxBase, fluxMode: 'draft' as const };
      }

      return {
        ...fluxBase,
        fluxMode: 'standard' as const,
        steps: f.field('steps', FLUX_STEPS),
        resources: (() => {
          const value = f.field('resources', resourcesCodec, {
            meta: { limit: ext.limits.maxResources },
          });
          return value.length > ext.limits.maxResources
            ? f.correct('resources', value.slice(0, ext.limits.maxResources), 'over_limit')
            : value;
        })(),
      };
    }

    case 'SD': {
      const sd = {
        ecosystem: 'SD' as const,
        model,
        seed,
        sampler: f.field('sampler', samplerCodec),
        steps: f.field('steps', SD_STEPS),
      };
      if (workflow !== 'image:draft') {
        return { ...sd, cfgScale: f.field('cfgScale', CFG_SCALE) };
      }
      return sd;
    }
  }
}

function upscaleSection(f: Fields) {
  return {
    upscaler: f.field('upscaler', upscalerCodec),
    scale: f.field('scale', UPSCALE_SCALE),
  };
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function resolveMini(f: Fields, ext: MiniExt) {
  const workflow = f.field('workflow', workflowCodec);
  const outputType = f.computed('outputType', workflow.startsWith('video') ? 'video' : 'image');
  const prompt = f.field('prompt', promptCodec);
  const head = { workflow, outputType, prompt };

  switch (workflow) {
    // `workflow` is restated so the branch carries the NARROWED literal: `head`
    // was built before the switch, so its `workflow` is still the full union and
    // would defeat discrimination. Cheap, but easy to forget.
    case 'image:upscale':
      return { ...head, workflow, ...upscaleSection(f) };
    default:
      return { ...head, workflow, ...ecosystemSection(f, ext, workflow) };
  }
}

/**
 * The state union, inferred natively from the resolver's return type — no
 * BuildDiscriminatedUnion, no accumulated generics, no depth budget.
 */
export type MiniState = ReturnType<typeof resolveMini>;

/** Mirrors the flux draft<->model coupling that v1 expresses as two effects. */
const reconcile: PatchReconciler<MiniState, MiniExt> = (patch, state) => {
  // `model` only exists on the ecosystem branches — the upscale branch has none.
  const model = 'model' in state ? state.model : undefined;

  if ('workflow' in patch) {
    const draft = patch.workflow === 'image:draft';
    if (draft && model !== 'flux-draft') return { ...patch, model: 'flux-draft' };
    if (!draft && model === 'flux-draft') return { ...patch, model: 'flux-standard' };
  }
  if ('model' in patch) {
    const draftModel = patch.model === 'flux-draft';
    if (draftModel && state.workflow !== 'image:draft') return { ...patch, workflow: 'image:draft' };
    if (!draftModel && state.workflow === 'image:draft')
      return { ...patch, workflow: 'image:create' };
  }
  return patch;
};

export const miniForm = defineForm<MiniExt>()({ resolve: resolveMini, reconcile });

export const defaultExt: MiniExt = { limits: { maxResources: 3 }, tier: 'free' };
