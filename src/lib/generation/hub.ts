import { z } from 'zod';
import { codec, defineForm, type Fields } from '../core/index.js';
import {
  createImagesKit,
  createQuantityKit,
  createScaleFactorKit,
  createUpscalerKit,
  enumCodec,
  type EnumOption,
} from './codecs/index.js';
import {
  getDefaultEcosystemForWorkflow,
  getEcosystemsForWorkflow,
  getInputTypeForWorkflow,
  getOutputTypeForWorkflow,
  migrateWorkflowKey,
  workflowConfigByKey,
  type GenerationExt,
} from './config.js';
import {
  experimentalDismissId,
  experimentalTargets,
  mergeGateStates,
  pickStrongerGate,
  rulesToStates,
  type GateItemState,
  type GateResolution,
} from './gates.js';
import { fluxCheckpoint, fluxCoupling } from './flux.js';
import { ltxCheckpoint, nbCheckpoint, sdCheckpoint, wanCheckpoint, wanCoupling } from './ecosystems.js';
import { imageFamilyResolver, videoFamilyResolver } from './families.js';
import { hubCoupling } from './shared.js';

/**
 * Port of generation-graph.ts + ecosystem-graph.ts — the hub. The workflow
 * field carries key migration and the gate refine; ecosystem is remembered PER
 * WORKFLOW (v1's scoped storage config); routing is a switch over the
 * ecosystem's GROUP, so grouped ecosystems share one code path.
 */

interface WorkflowMeta {
  options: { value: string; label: string }[];
  gateStates: GateItemState[];
  gatedKeys: string[];
}

const WORKFLOW = codec<string, WorkflowMeta>({
  input: z
    .string()
    .optional()
    .transform((key) => migrateWorkflowKey(key)),
  output: z.string(),
  default: 'txt2img',
});

interface EcosystemMeta {
  options: { value: string; label: string }[];
  gateStates: GateItemState[];
  experimental: { key: string; message: string | undefined; dismissId: string }[];
}

const ECOSYSTEM = codec<string, EcosystemMeta>({
  input: z.string().optional(),
  output: z.string(),
});

const PRIORITY = enumCodec({
  options: [
    { label: 'Low', value: 'low' },
    { label: 'Normal', value: 'normal' },
    { label: 'High', value: 'high' },
  ],
  default: 'low',
});

const OUTPUT_FORMAT = enumCodec({
  options: [
    { label: 'JPEG', value: 'jpeg' },
    { label: 'PNG', value: 'png' },
  ],
  default: 'jpeg',
});

const quantity = createQuantityKit({});
const upscaleImages = createImagesKit({ max: 1, min: 1 });
const upscaler = createUpscalerKit({ defaultId: 164821 });
const scaleFactor = createScaleFactorKit({ multipliers: [2, 3, 4], maxOutputResolution: 4096 });

function workflowField(f: Fields, ext: GenerationExt) {
  const { workflows } = rulesToStates(ext.gateRules ?? []);
  const { hidden, states } = mergeGateStates(undefined, workflows);
  const gated = new Set([...hidden, ...states.map((s) => s.key)]);
  const gatedKey = [...gated].sort().join('|');

  return f.field('workflow', WORKFLOW, {
    // Gated keys reject — the server-side backstop for a stale value or
    // crafted request, and a live error client-side. The picker hides/badges
    // via meta.
    refine: (s) =>
      s.refine((key) => !gated.has(key), {
        message: 'Workflow is currently unavailable',
        params: { kind: 'gated' },
      }),    meta: {
      options: [...workflowConfigByKey.keys()]
        .filter((key) => !hidden.includes(key))
        .map((key) => ({ value: key, label: key })),
      gateStates: states,
      gatedKeys: [...gated],
    },
  });
}

function resolveGeneration(f: Fields, ext: GenerationExt) {
  const workflow = workflowField(f, ext);
  const output = f.computed('output', getOutputTypeForWorkflow(workflow));
  const input = f.computed('input', getInputTypeForWorkflow(workflow));
  // High priority is member-gated (v1's PriorityOption.memberOnly): badged in
  // meta via a domain extension of EnumOption, and refused on submit for
  // non-members — same backstop as gates.
  const priority = f.field('priority', PRIORITY, {
    refine: (s) =>
      s.refine((value) => !(value === 'high' && !ext.user.isMember), {
        message: 'High priority requires membership',
        params: { kind: 'member_only' },
      }),    meta: {
      options: [
        { label: 'Low', value: 'low' as const },
        { label: 'Normal', value: 'normal' as const },
        { label: 'High', value: 'high' as const, memberOnly: true, disabled: !ext.user.isMember },
      ] as (EnumOption<'low' | 'normal' | 'high'> & { memberOnly?: boolean })[],
    },
  });
  const head = { workflow, output, input, priority };

  const workflowConfig = workflowConfigByKey.get(workflow);

  if (!workflowConfig?.ecosystems) {
    const images = upscaleImages.field(f, { scope: workflow });
    const source = images[0];
    return {
      ...head,
      workflow: workflow as 'img2img:upscale',
      images,
      upscaler: upscaler.field(f, undefined),
      scaleFactor: scaleFactor.field(f, {
        sourceWidth: source?.width,
        sourceHeight: source?.height,
      }),
    };
  }

  // Ecosystem branch: ecosystem remembered per workflow, validated against it.
  // Gates fold rule states + the self-hosted toggle into one per-item state map
  // (v1's ecosystem node): hidden removes from options, the rest badge and are
  // REJECTED on submit — shown-but-disabled is a picker affordance, not access.
  const available = getEcosystemsForWorkflow(workflow);
  const ruleStates = rulesToStates(ext.gateRules ?? []).ecosystems;
  const selfHostedState: GateResolution = {
    state: ext.selfHostedMode === 'memberOnly' ? 'memberOnly' : 'disabled',
  };
  const ecoGates = new Map<string, GateResolution>();
  for (const key of available) {
    let resolution = ruleStates.get(key);
    if (ext.selfHostedDisabledEcosystems?.includes(key)) {
      resolution = pickStrongerGate(resolution, selfHostedState);
    }
    if (resolution) ecoGates.set(key, resolution);
  }
  const ecoGateKey = [...ecoGates.keys()].sort().join('|');
  const hiddenEcosystems = [...ecoGates].filter(([, r]) => r.state === 'hidden').map(([k]) => k);
  const ecoStates: GateItemState[] = [...ecoGates]
    .filter(([, r]) => r.state !== 'hidden')
    .map(([key, r]) => ({ key, state: r.state as GateItemState['state'], message: r.message }));
  const experimental = experimentalTargets(ext.gateRules ?? []).ecosystems;

  let ecosystem = f.field('ecosystem', ECOSYSTEM, {
    scope: workflow,
    default: () => getDefaultEcosystemForWorkflow(workflow) ?? 'Flux1',
    refine: (s) =>
      s.refine((key) => !ecoGates.has(key), {
        message: 'Ecosystem is currently unavailable',
        params: { kind: 'gated' },
      }),    meta: {
      options: available
        .filter((key) => !hiddenEcosystems.includes(key))
        .map((key) => ({ value: key, label: key })),
      gateStates: ecoStates,
      experimental: available
        .filter((key) => experimental.has(key))
        .map((key) => ({
          key,
          message: experimental.get(key),
          dismissId: experimentalDismissId({ kind: 'ecosystem', key }, experimental.get(key)),
        })),
    },
  });
  if (!available.includes(ecosystem as (typeof available)[number])) {
    ecosystem = f.correct('ecosystem', available[0]!, 'not_available_for_workflow', { workflow });
  }

  const quantityField = quantity.field(f, {
    max: output === 'video' ? ext.limits.vidQuantity : ext.limits.maxQuantity,
  });
  const outputFormat =
    output === 'image' ? f.field('outputFormat', OUTPUT_FORMAT) : undefined;

  const shared = {
    ...head,
    quantity: quantityField,
    ...(outputFormat !== undefined ? { outputFormat } : {}),
  };
  const ctx = { workflow, ecosystem };

  // Route by OUTPUT FAMILY first (the seam new families — audio, 3d — extend),
  // then the family resolver routes by ecosystem group.
  switch (output) {
    case 'video':
      return { ...shared, ...videoFamilyResolver(f, ext, ctx) };
    default:
      return { ...shared, ...imageFamilyResolver(f, ext, ctx) };
  }
}

export type GenerationState = ReturnType<typeof resolveGeneration>;

export const generationForm = defineForm<GenerationExt>()({
  resolve: resolveGeneration,
  // Named rule units (kits + defineRules products), hub first so branch rules
  // see the hub's corrections. Couplings before their branch's checkpoint kit.
  reconcile: [
    hubCoupling,
    fluxCoupling,
    fluxCheckpoint,
    sdCheckpoint,
    ltxCheckpoint,
    wanCoupling,
    wanCheckpoint,
    nbCheckpoint,
  ],
});
