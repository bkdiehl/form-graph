import { z } from 'zod';
import { codec } from '../core/index.js';
import {
  MAX_PROMPT_LENGTH,
  MAX_SEED,
  type AspectRatioOption,
} from './constants.js';

/**
 * Codecs mirroring v1's common.ts node builders EXACTLY — same input leniency,
 * same output strictness, same transforms. Each family module hoists every
 * variant it needs (per resolution, per config) so nothing zod-shaped is
 * constructed during resolution.
 */

// --- helpers copied verbatim from v1 common.ts --------------------------------

function snapToStep(val: number, step: number, min: number, max: number): number {
  const precision = Math.max(0, -Math.floor(Math.log10(step)));
  const snapped = Math.round(val / step) * step;
  const rounded = parseFloat(snapped.toFixed(precision));
  return Math.min(Math.max(rounded, min), max);
}

/** v1 aspect-ratio-helpers.findClosestAspectRatio, verbatim behaviour. */
function findClosestAspectRatio(
  source: { width: number; height: number },
  options: AspectRatioOption[]
): AspectRatioOption {
  const sourceRatio = source.width / source.height;
  let closest = options[0]!;
  let smallestDiff = Infinity;
  for (const option of options) {
    const diff = Math.abs(option.width / option.height - sourceRatio);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closest = option;
    }
  }
  return closest;
}

// --- sliders / enums / seed ---------------------------------------------------

export interface SliderMeta {
  min: number;
  max: number;
  step: number;
  presets?: { label: string; value: number }[];
}

export function v1SliderCodec(opts: {
  min: number;
  max: number;
  step?: number;
  default?: number;
  presets?: { label: string; value: number }[];
}) {
  const { min, max, step = 1 } = opts;
  return codec<number, SliderMeta>({
    input: z.coerce
      .number()
      .optional()
      .transform((val) => (val === undefined ? undefined : snapToStep(val, step, min, max))),
    output: z.number().min(min).max(max),
    default: opts.default ?? min,
    meta: { min, max, step, presets: opts.presets },
  });
}

export interface EnumMeta<T extends string | number> {
  options: readonly { label: string; value: T }[];
}

/**
 * v1 enumNode parity note: v1's input schema REJECTS an unknown value (the
 * parse errors) rather than falling back. We mirror that: the refine failure
 * makes the boundary parse fail, and the boundary layer then falls back to the
 * default — v1's safeParse instead reports an input error. Divergence is
 * documented in the parity tests where it matters.
 */
export function v1EnumCodec<const T extends string | number>(opts: {
  options: readonly { label: string; value: T }[];
  default: T;
}) {
  const values = opts.options.map((o) => o.value);
  const isNumeric = typeof values[0] === 'number';
  const base = (isNumeric ? z.coerce.number() : z.coerce.string()) as z.ZodType<unknown>;
  const schema = base.refine((v) => values.includes(v as T)) as unknown as z.ZodType<T>;
  return codec<T, EnumMeta<T>>({
    input: schema.optional(),
    output: schema,
    default: opts.default,
    meta: { options: opts.options },
  });
}

export const SEED = codec<number | undefined>({
  input: z
    .union([z.null(), z.undefined(), z.coerce.number().int().min(1).max(MAX_SEED)])
    .optional()
    .transform((val) => (val === null ? undefined : val)),
  output: z.number().int().min(1).max(MAX_SEED).optional(),
  default: undefined,
});

// --- aspect ratio -------------------------------------------------------------

export interface AspectRatioValue {
  value: string;
  width: number;
  height: number;
}
export interface AspectRatioMeta {
  options: AspectRatioOption[];
  priorityOptions?: string[];
}

export function v1AspectRatioCodec(opts: { options: AspectRatioOption[]; default?: string }) {
  const options = opts.options;
  const defaultOption = options.find((o) => o.value === (opts.default ?? '1:1')) ?? options[0]!;
  const toValue = ({ value, width, height }: AspectRatioOption): AspectRatioValue => ({
    value,
    width,
    height,
  });
  return codec<AspectRatioValue, AspectRatioMeta>({
    input: z
      .union([
        z.string(),
        z.object({ value: z.string(), width: z.number().optional(), height: z.number().optional() }),
      ])
      .optional()
      .transform((val) => {
        if (!val) return toValue(defaultOption);
        const value = typeof val === 'string' ? val : val.value;
        const exact = options.find((o) => o.value === value);
        if (exact) return toValue(exact);
        if (typeof val === 'object' && val.width && val.height) {
          return toValue(findClosestAspectRatio({ width: val.width, height: val.height }, options));
        }
        const parts = value.split(':').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]!) && !isNaN(parts[1]!)) {
          return toValue(findClosestAspectRatio({ width: parts[0]!, height: parts[1]! }, options));
        }
        return toValue(defaultOption);
      }),
    output: z.object({ value: z.string(), width: z.number(), height: z.number() }),
    default: toValue(defaultOption),
    meta: { options },
  });
}

// --- text (prompt / negativePrompt) -------------------------------------------

export interface TextMeta {
  required: boolean;
  targetKey: string;
  triggerWords: string[];
}

/**
 * v1 textNode: output trims, caps length, and (when required) rejects empty.
 * Requiredness is per-pass (prompt is required only when no images are
 * attached), so it lives at the call site as a `refine` — this codec carries
 * the unconditional part.
 */
export function v1TextCodec(name: string, maxLength = MAX_PROMPT_LENGTH) {
  return codec<string, TextMeta>({
    input: z.string().optional(),
    output: z.string().trim().max(maxLength, `${name} is too long`),
    default: '',
  });
}

export const requiredText = (name: string, message?: string) => (value: string) =>
  value.trim().length > 0 || false
    ? true
    : { message: message ?? `${name} is required` };

// --- snippets ------------------------------------------------------------------

const snippetReferenceSchema = z.object({
  categoryId: z.number().int().positive(),
  in: z.array(z.number().int().positive()).default([]),
  ex: z.array(z.number().int().positive()).default([]),
});

export const snippetsSchema = z.object({
  wildcardSetIds: z.array(z.number().int().positive()).default([]),
  mode: z.enum(['random', 'batch']).default('random'),
  batchCount: z.number().int().positive().default(1),
  seed: z.number().int().positive().optional(),
  targets: z.record(z.string(), z.array(snippetReferenceSchema)).default({}),
});
export type SnippetsValue = z.infer<typeof snippetsSchema>;

export const SNIPPETS = codec<SnippetsValue>({
  input: snippetsSchema.optional(),
  output: snippetsSchema,
  default: { wildcardSetIds: [], mode: 'random', batchCount: 1, targets: {} },
});

// --- resources / model ---------------------------------------------------------

export const resourceSchema = z.object({
  id: z.number(),
  baseModel: z.string().optional(),
  model: z.object({ type: z.string() }),
  strength: z.number().optional(),
  trainedWords: z.array(z.string()).optional(),
  epochDetails: z.object({ epochNumber: z.number().optional() }).optional(),
});
export type ResourceData = z.infer<typeof resourceSchema>;

const resourceInputSchema = z.union([
  z.number().transform((id) => ({ id })),
  z.looseObject({ id: z.number() }),
]);

export interface ResourcesMeta {
  limit: number;
}

const resourcesCodecCache = new Map<number, ReturnType<typeof buildResourcesCodec>>();

/**
 * v1 resourcesNode: lenient array input, strict capped output, default [].
 * Cached per limit — the limit comes from ext (rarely changes), so per-pass
 * calls stay construction-free.
 */
export function v1ResourcesCodec(limit: number) {
  let cached = resourcesCodecCache.get(limit);
  if (!cached) {
    cached = buildResourcesCodec(limit);
    resourcesCodecCache.set(limit, cached);
  }
  return cached;
}

function buildResourcesCodec(limit: number) {
  return codec<ResourceData[], ResourcesMeta>({
    input: resourceInputSchema.array().optional() as unknown as z.ZodType<
      ResourceData[] | undefined
    >,
    output: resourceSchema
      .array()
      .max(limit, 'You have exceeded the maximum number of allowed resources')
      .optional() as unknown as z.ZodType<ResourceData[]>,
    default: [],
    meta: { limit },
  });
}

export interface CheckpointMeta {
  modelLocked: boolean;
  versions: unknown;
  defaultModelId: number | undefined;
  excludeIds: number[];
}

/**
 * v1 createCheckpointGraph's model node, minus the effects (those become
 * rules at the family level). Locked substitution happens at the input
 * boundary in v1; here it is a `correct`, declared at the call site so the
 * note carries the reason.
 */
export const MODEL = codec<ResourceData | undefined, CheckpointMeta>({
  input: z
    .union([
      z.number().transform((id) => ({ id })),
      z.looseObject({ id: z.number(), baseModel: z.string().optional() }),
    ])
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      if (!('model' in val) || !val.model) {
        return { ...val, model: { type: 'Checkpoint' } } as ResourceData;
      }
      return val as ResourceData;
    }),
  output: resourceSchema.optional() as unknown as z.ZodType<ResourceData | undefined>,
});

// --- media ----------------------------------------------------------------------

export interface ImageEntry {
  url: string;
  width: number;
  height: number;
}
export interface ImagesMeta {
  min: number;
  max: number;
  slots?: { label: string; required?: boolean }[];
  warnOnMissingAiMetadata?: boolean;
  aspectRatios?: string[];
}

/** v1 imagesNode: min from required slots, max from slots length (or config). */
export function v1ImagesCodec(config: {
  min?: number;
  max?: number;
  slots?: { label: string; required?: boolean }[];
  warnOnMissingAiMetadata?: boolean;
  aspectRatios?: string[];
}) {
  const max = config.slots?.length ?? config.max ?? 1;
  const min = config.slots ? config.slots.filter((s) => s.required).length : config.min ?? 1;
  const imageObject = z.object({
    url: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
  });
  return codec<ImageEntry[], ImagesMeta>({
    input: z
      .union([z.url(), imageObject])
      .array()
      .optional()
      .transform((arr) =>
        arr
          ? arr.slice(0, max).map((item) => (typeof item === 'string' ? { url: item } : item))
          : undefined
      ) as unknown as z.ZodType<ImageEntry[] | undefined>,
    output: z
      .object({ url: z.string(), width: z.number(), height: z.number() })
      .array()
      .min(
        min,
        max === 1 ? 'An image is required' : `At least ${min} image${min > 1 ? 's are' : ' is'} required`
      )
      .max(max, `Maximum ${max} image${max > 1 ? 's' : ''} allowed`),
    default: [],
    meta: {
      min,
      max,
      slots: config.slots,
      warnOnMissingAiMetadata: config.warnOnMissingAiMetadata,
      aspectRatios: config.aspectRatios,
    },
  });
}

const videoMetadataSchema = z.object({
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  duration: z.number(),
});
export type VideoValue = { url: string; metadata?: z.infer<typeof videoMetadataSchema> };

export const VIDEO = codec<VideoValue | undefined>({
  input: z
    .union([z.string().transform((url) => ({ url })), z.object({ url: z.string(), metadata: videoMetadataSchema.optional() })])
    .optional(),
  output: z.object(
    { url: z.string(), metadata: videoMetadataSchema.optional() },
    { message: 'A video is required' }
  ) as unknown as z.ZodType<VideoValue>,
  default: undefined,
});

export const BOOL = (dflt: boolean) =>
  codec<boolean>({
    input: z.boolean().optional(),
    output: z.boolean(),
    default: dflt,
  });
