import { z } from 'zod';
import { codec } from '../../core/codec.js';
import { defineFieldKit } from '../../core/field-kit.js';

/**
 * Port of controlNetsNode. The preprocessor registry is app data (labels,
 * categories, requiresPreprocessedImage) and is injected; each ecosystem
 * builds one kit instance at module scope with its allowed keys — the codec
 * (with its per-ecosystem refine) resolves once, per the churn rule.
 */

export const controlNetModes = ['auto', 'preprocessed'] as const;
export type ControlNetMode = (typeof controlNetModes)[number];

const WEIGHT = { min: 0, max: 2, default: 1 };
const STEP = { min: 0, max: 1 };

const imageObject = z.object({
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});

const entryInput = z.object({
  preprocessor: z.string(),
  mode: z.enum(controlNetModes).optional(),
  // Optional: users may stage an entry before uploading a reference image.
  image: z.union([z.string(), imageObject]).optional(),
  weight: z.coerce.number().min(WEIGHT.min).max(WEIGHT.max).optional(),
  startStep: z.coerce.number().min(STEP.min).max(STEP.max).optional(),
  endStep: z.coerce.number().min(STEP.min).max(STEP.max).optional(),
});

const entryOutput = z.object({
  preprocessor: z.string(),
  mode: z.enum(controlNetModes),
  image: imageObject,
  weight: z.number().min(WEIGHT.min).max(WEIGHT.max),
  startStep: z.number().min(STEP.min).max(STEP.max),
  endStep: z.number().min(STEP.min).max(STEP.max),
});

export type ControlNetEntryValue = z.infer<typeof entryOutput>;
/** State entry: image may still be missing while the user stages the row. */
export type ControlNetEntryState = Omit<ControlNetEntryValue, 'image'> & {
  image?: z.infer<typeof imageObject>;
};

export interface PreprocessorInfo {
  label: string;
  description: string;
  category: string;
  recommended?: boolean;
  requiresPreprocessedImage?: boolean;
}

export interface ControlNetsMeta {
  options: (PreprocessorInfo & { value: string })[];
  groups: { category: string; label: string; options: (PreprocessorInfo & { value: string })[] }[];
  limit: number;
  weight: { min: number; max: number; default: number; step: number };
  step: { min: number; max: number; step: number };
}

export interface ControlNetsKitConfig {
  /** The app's preprocessor registry. */
  registry: Record<string, PreprocessorInfo>;
  categoryLabels: Record<string, string>;
  /** Ecosystem's allowed keys, in display order. Deduped; unknown keys dropped. */
  preprocessors: readonly string[];
  limit?: number;
}

export const createControlNetsKit = defineFieldKit<
  ControlNetsKitConfig,
  void,
  ControlNetEntryState[],
  ControlNetsMeta
>({
  key: 'controlNets',
  codec: (config) => {
    const limit = config.limit ?? 4;

    const validKeys = [...new Set(config.preprocessors)].filter((key) => config.registry[key]);
    const allowed = new Set(validKeys);
    const options = validKeys.map((key) => ({ value: key, ...config.registry[key]! }));

    const groupMap = new Map<string, typeof options>();
    for (const opt of options) {
      const bucket = groupMap.get(opt.category);
      if (bucket) bucket.push(opt);
      else groupMap.set(opt.category, [opt]);
    }
    const groups = [...groupMap.entries()].map(([category, opts]) => ({
      category,
      label: config.categoryLabels[category] ?? category,
      options: opts,
    }));

    return codec<ControlNetEntryState[], ControlNetsMeta>({
      input: entryInput
        .refine((e) => allowed.has(e.preprocessor), {
          message: 'Unsupported ControlNet preprocessor for this model',
          path: ['preprocessor'],
        })
        .array()
        .max(limit)
        .optional()
        .transform((arr) =>
          arr?.map((entry): ControlNetEntryState => {
            const image = typeof entry.image === 'string' ? { url: entry.image } : entry.image;
            const requiresPreprocessed =
              config.registry[entry.preprocessor]?.requiresPreprocessedImage ?? false;
            return {
              preprocessor: entry.preprocessor,
              mode: requiresPreprocessed ? 'preprocessed' : entry.mode ?? 'auto',
              // Empty-url images normalise away so output can drop staged rows.
              image: image?.url ? image : undefined,
              weight: entry.weight ?? WEIGHT.default,
              startStep: entry.startStep ?? STEP.min,
              endStep: entry.endStep ?? STEP.max,
            };
          })
        ),
      // Staged rows (no image yet) are dropped, not errors — then validated.
      output: z
        .array(z.unknown())
        .max(limit, `Maximum ${limit} ControlNets allowed`)
        .transform((arr) =>
          arr.filter(
            (e): e is ControlNetEntryValue =>
              typeof e === 'object' &&
              e !== null &&
              !!(e as { image?: { url?: string } }).image?.url
          )
        )
        .pipe(entryOutput.array()) as unknown as z.ZodType<ControlNetEntryState[]>,
      default: [],
      meta: {
        options,
        groups,
        limit,
        weight: { ...WEIGHT, step: 0.05 },
        step: { ...STEP, step: 0.05 },
      },
    });
  },
});
