import { z } from 'zod';
import { type RuleMap } from '../core/index.js';
import { codec } from '../core/codec.js';
import { type Fields } from '../core/resolve.js';
import {
  createCheckpointKit,
  createResourcesKit,
  seedCodec,
  type CheckpointCatalog,
  type CheckpointKitConfig,
  type ResourceValue,
} from './codecs/index.js';
import {
  baseModelToEcosystem,
  ecosystemByKey,
  fluxVersionIds,
  getWorkflowsForEcosystem,
  isWorkflowAvailable,
  workflowConfigByKey,
} from './config.js';

export const catalog: CheckpointCatalog = {
  ecosystemKeyForBaseModel: (baseModel) => baseModelToEcosystem.get(baseModel),
  ecosystemDefaults: (ecosystem) =>
    ({
      Flux1: { modelId: fluxVersionIds.standard },
      SD1: { modelId: 128713 }, // DreamShaper — SD1's real default checkpoint
      SDXL: { modelId: 128078 },
      LTXV2: { modelId: 2200001, modelLocked: true },
      LTXV23: { modelId: 2300001, modelLocked: true },
      NanoBanana: { modelId: 3000001, modelLocked: true },
      WanV21_480p: { modelId: 4800001, modelLocked: true },
      WanV21_720p: { modelId: 7200001, modelLocked: true },
    }[ecosystem]),
  isWorkflowAvailable,
  workflowsForEcosystem: getWorkflowsForEcosystem,
  workflowVariant: (workflow) =>
    workflow === 'txt2img:draft'
      ? // draft is a variant of txt2img; the flux ultra version can't run it
        { variantOf: 'txt2img', excludeModelVersionIds: [fluxVersionIds.ultra] }
      : undefined,
};

export const checkpointKit = (config: Omit<CheckpointKitConfig, 'catalog'>) =>
  createCheckpointKit({ catalog, ...config });

const resourceCompatible = (ecosystem: string, resource: ResourceValue) => {
  if (!resource.baseModel) return true;
  return baseModelToEcosystem.get(resource.baseModel) === ecosystem;
};

export const resourcesKit = createResourcesKit({ isCompatible: resourceCompatible });

export const groupOf = (ecosystem: string) => ecosystemByKey.get(ecosystem)?.group ?? ecosystem;

// --- text editors + snippets ------------------------------------------------

export interface TextEditorMeta {
  /** Trained-word chips derived from the selected model + resources (gap 1). */
  triggerWords: string[];
}

const textEditorCodec = (required: boolean) =>
  codec<string, TextEditorMeta>({
    input: z.coerce.string().optional(),
    output: required ? z.string().min(1, 'Required').max(6000) : z.string().max(6000),
    default: '',
    meta: { triggerWords: [] },
  });

export const PROMPT = textEditorCodec(false);
export const PROMPT_REQUIRED = textEditorCodec(true);
export const NEGATIVE_PROMPT = textEditorCodec(false);
export const SEED = seedCodec();

export interface SnippetsValue {
  sets: { id: number; name: string }[];
  mode: 'sequential' | 'random';
  batchCount?: number;
}

/** Loaded wildcard packs — global (a pack loaded on SDXL stays loaded on Flux). */
export const SNIPPETS = codec<SnippetsValue>({
  input: z
    .looseObject({})
    .optional()
    .transform((v) => v as SnippetsValue | undefined),
  output: z.object({
    sets: z.array(z.object({ id: z.number(), name: z.string() })),
    mode: z.enum(['sequential', 'random']),
    batchCount: z.number().optional(),
  }),
  default: { sets: [], mode: 'sequential' },
});

/**
 * The text section: prompt (+ optional negative), snippets, and the editor
 * TARGETS map. v1's editors register themselves into `snippets.targets` via a
 * multi-pass converging effect; here the active editors are declared in the
 * same pass, so targets is a plain computed.
 */
export function textSection(
  f: Fields,
  opts: { promptRequired: boolean; negativePrompt?: boolean; triggerWords?: string[] }
) {
  // v1's triggerWordsGraph: a value derived from OTHER fields (model +
  // resources) surfacing in this field's meta — the resolver already holds
  // those values as locals, so the cross-field derivation is an argument.
  const triggerWords = opts.triggerWords ?? [];
  f.computed('triggerWords', triggerWords);

  const prompt = f.field('prompt', opts.promptRequired ? PROMPT_REQUIRED : PROMPT, {
    meta: { triggerWords },
  });
  const negativePrompt = opts.negativePrompt
    ? f.field('negativePrompt', NEGATIVE_PROMPT)
    : undefined;

  const snippets = f.field('snippets', SNIPPETS);
  const editors = opts.negativePrompt ? ['prompt', 'negativePrompt'] : ['prompt'];
  f.computed('snippetTargets', editors);

  return opts.negativePrompt
    ? { prompt, negativePrompt: negativePrompt!, snippets, triggerWords }
    : { prompt, snippets, triggerWords };
}

/** Trained words from the checkpoint + additional resources. */
export function collectTriggerWords(
  model: ResourceValue | undefined,
  resources: ResourceValue[] = []
): string[] {
  const words = new Set<string>();
  for (const word of model?.trainedWords ?? []) words.add(word);
  for (const resource of resources) for (const word of resource.trainedWords ?? []) words.add(word);
  return [...words];
}

/**
 * The ecosystem-graph pair splits by KIND in this model. workflow→ecosystem
 * ("new workflow can't run the current ecosystem") is a VALIDITY clamp — it
 * lives in the ecosystem field's projection, which is per-scope, so the target
 * workflow's own remembered ecosystem wins over any forced default (v1 gets
 * the same ordering from storage reload beating the effect). Only
 * ecosystem→workflow — a genuine conflict between two user choices — remains
 * a patch rule.
 */
export const hubCoupling: RuleMap<{ workflow?: string }> = {
  ecosystem: (ecosystem: string, { patch, state }) => {
    if ('workflow' in patch) return;
    if (!state.workflow || isWorkflowAvailable(state.workflow, ecosystem)) return;
    const [first] = getWorkflowsForEcosystem(ecosystem);
    if (first) return { workflow: first };
  },
};
