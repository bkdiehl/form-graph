import { z } from 'zod';
import { codec, defineForm, type Fields } from '../core/index.js';

/**
 * A fixture shaped after the graphs v1's tests actually exercise, so the parity
 * suite asserts the same behaviours against the new engine:
 *
 * - mage-flow-graph.test.ts — per-workflow checkpoint options, per-workflow
 *   defaults, and a checkpoint that cannot survive into an incompatible
 *   workflow; turbo builds carry tighter slider ranges
 * - seedream-graph.test.ts  — a toggle that disappears for some versions, and a
 *   stale stored value that must not win over the version's real capability
 * - model-substitution.test.ts — the clamp is observable, and the model the
 *   graph settles on is identical whether or not anyone is observing
 */

export type ParityExt = {
  limits: { maxResources: number };
  user: { tier: 'free' | 'gold' };
};

export const parityExt: ParityExt = { limits: { maxResources: 9 }, user: { tier: 'gold' } };

export const versionIds = {
  txt2imgStandard: 1,
  txt2imgTurbo: 2,
  editStandard: 3,
  editTurbo: 4,
} as const;

export const WORKFLOWS = ['txt2img', 'img2img:edit'] as const;
export type ParityWorkflow = (typeof WORKFLOWS)[number];

/** Which checkpoints each workflow offers, in display order. Defaults are [0]. */
const VERSIONS_BY_WORKFLOW: Record<ParityWorkflow, number[]> = {
  txt2img: [versionIds.txt2imgStandard, versionIds.txt2imgTurbo],
  'img2img:edit': [versionIds.editStandard, versionIds.editTurbo],
};

const TURBO_IDS = new Set<number>([versionIds.txt2imgTurbo, versionIds.editTurbo]);

/** Only some versions expose the resolution toggle (seedream v5.0-pro does not). */
const RESOLUTION_CAPABLE = new Set<number>([versionIds.txt2imgStandard, versionIds.editStandard]);

const RESOLUTIONS = ['2K', '4K'] as const;
export type Resolution = (typeof RESOLUTIONS)[number];

const DIMENSIONS: Record<Resolution, number> = { '2K': 2048, '4K': 4096 };

const workflowCodec = codec<ParityWorkflow, { options: readonly ParityWorkflow[] }>({
  output: z.enum(WORKFLOWS),
  default: 'txt2img',
  meta: { options: WORKFLOWS },
});

const modelCodec = codec<number>({
  output: z.number(),
  input: z.coerce.number().optional(),
});

const resolutionCodec = codec<Resolution, { options: readonly Resolution[] }>({
  output: z.enum(RESOLUTIONS),
  default: '2K',
  meta: { options: RESOLUTIONS },
});

const stepsCodec = codec<number, { min: number; max: number }>({
  output: z.number().min(1).max(50),
  input: z.coerce.number().optional(),
});

const cfgCodec = codec<number, { min: number; max: number }>({
  output: z.number().min(1).max(10),
  input: z.coerce.number().optional(),
});

const promptCodec = codec<string>({
  output: z.string().min(1, 'Prompt is required'),
  input: z.coerce.string().optional(),
  default: '',
});

function resolveParity(f: Fields, ext: ParityExt) {
  const workflow = f.field('workflow', workflowCodec);
  const prompt = f.field('prompt', promptCodec);

  const options = VERSIONS_BY_WORKFLOW[workflow];
  const fallback = options[0]!;

  // The clamp: a checkpoint from another workflow can never survive into this
  // one. v1 does this in a node transform and reports it through a collector
  // hung on ext; here the adjustment is reported as a resolution note.
  let model = f.field('model', modelCodec, {
    default: fallback,
    meta: { options },
  });
  if (!options.includes(model)) {
    model = f.correct('model', fallback, 'workflow-incompatible', { workflow });
  }

  const turbo = TURBO_IDS.has(model);
  f.computed('isTurbo', turbo);

  // Turbo builds cap much lower, and a stored higher value must be clamped
  // rather than kept (v1: mage-flow turbo slider ranges).
  const stepsMax = turbo ? 12 : 50;
  const cfgMax = turbo ? 2 : 10;
  const steps = f.field('steps', stepsCodec, {
    default: turbo ? 8 : 25,
    meta: { min: 1, max: stepsMax },
  });
  if (steps > stepsMax) f.correct('steps', stepsMax, 'turbo_cap');
  const cfgScale = f.field('cfgScale', cfgCodec, {
    default: turbo ? 1 : 4,
    meta: { min: 1, max: cfgMax },
  });
  if (cfgScale > cfgMax) f.correct('cfgScale', cfgMax, 'turbo_cap');

  // The toggle simply does not exist for versions that cannot do it, so a stale
  // stored '4K' cannot leak into the dimensions below.
  const resolution = RESOLUTION_CAPABLE.has(model)
    ? f.field('resolution', resolutionCodec)
    : ('2K' as const);

  f.computed('dimensions', `${DIMENSIONS[resolution]}x${DIMENSIONS[resolution]}`);

  return { workflow, prompt, model, isTurbo: turbo, resolution };
}

export const parityForm = defineForm<ParityExt>()({ resolve: resolveParity });
