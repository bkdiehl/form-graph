import { z } from 'zod';
import { codec, defineFieldKit, type Scope } from '../core/index.js';

/**
 * Ports of imagesNode, videoNode, scaleFactorNode.
 *
 * Each workflow branch builds its own kit instance at module scope with its
 * slot/limit config, so the codec (whose output schema carries min/max) is
 * static per instance — matching how v1's leaf graphs configure these.
 */

export interface ImageValue {
  url: string;
  width?: number;
  height?: number;
}

export interface ImageSlotConfig {
  label: string;
  required?: boolean;
  disabled?: boolean;
}

export interface ImagesKitConfig {
  max?: number;
  min?: number;
  label?: string;
  description?: string;
  /** Named fixed positions (first/last frame); max/min derive from these. */
  slots?: ImageSlotConfig[];
  /** Mode entries that map to workflow keys — selecting one switches workflow. */
  modes?: { label: string; value: string; workflow: string }[];
  warnOnMissingAiMetadata?: boolean;
  aspectRatios?: `${number}:${number}`[];
  cropToFirstImage?: boolean;
}

export interface ImagesMeta extends ImagesKitConfig {
  min: number;
  max: number;
}

const imageObject = z.object({
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const createImagesKit = defineFieldKit<
  ImagesKitConfig,
  { scope?: Scope } | undefined,
  ImageValue[],
  ImagesMeta
>({
  key: 'images',
  // v1 persists images PER WORKFLOW; the append flow depends on reading the
  // target workflow's bucket, so callers pass `{ scope: workflow }`.
  options: (_config, args) => ({ scope: args?.scope }),
  codec: (config) => {
    const max = config.slots?.length ?? config.max ?? 1;
    const min = config.slots ? config.slots.filter((s) => s.required).length : config.min ?? 1;

    return codec<ImageValue[], ImagesMeta>({
      input: z
        .union([z.url().transform((url) => ({ url })), imageObject])
        .array()
        .optional()
        .transform((arr) => arr?.slice(0, max)),
      // Dimensions are required on output — the uploader fills them in.
      output: z
        .object({ url: z.string(), width: z.number(), height: z.number() })
        .array()
        .min(min, max === 1 ? 'An image is required' : `At least ${min} image${min > 1 ? 's are' : ' is'} required`)
        .max(max, `Maximum ${max} image${max > 1 ? 's' : ''} allowed`) as unknown as z.ZodType<ImageValue[]>,
      default: [],
      meta: { ...config, min, max },
    });
  },
});

export interface VideoMetadata {
  fps: number;
  width: number;
  height: number;
  duration: number;
}

export interface VideoValue {
  url: string;
  metadata?: VideoMetadata;
}

const videoMetadata = z.object({
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  duration: z.number(),
});

/** Output required, input optional — clearing works, submitting empty errors. */
export const createVideoKit = defineFieldKit<void, void, VideoValue | undefined>({
  key: 'video',
  codec: codec<VideoValue | undefined>({
    input: z
      .union([z.string().transform((url) => ({ url })), z.object({ url: z.string(), metadata: videoMetadata.optional() })])
      .optional(),
    output: z.object(
      { url: z.string(), metadata: videoMetadata.optional() },
      { message: 'A video is required' }
    ) as unknown as z.ZodType<VideoValue | undefined>,
  }),
});

export interface ScaleFactorOption {
  value: number;
  label: string;
  disabled: boolean;
  targetWidth: number;
  targetHeight: number;
}

export interface ScaleFactorMeta {
  options: ScaleFactorOption[];
  canUpscale: boolean;
  sourceWidth?: number;
  sourceHeight?: number;
  maxOutputResolution: number;
}

/**
 * Port of scaleFactorNode. One deliberate behaviour change, consistent with
 * the clamp-restores-intent decision: v1 rebuilds the output schema per source
 * size and ERRORS when factor x source exceeds the max resolution; here the
 * codec is static and an over-resolution factor is PROJECTED down to the
 * largest valid multiplier (the UI already disables invalid options, so v1
 * only errored on stale values).
 */
export const createScaleFactorKit = defineFieldKit<
  { multipliers: readonly number[]; maxOutputResolution: number },
  { sourceWidth?: number; sourceHeight?: number },
  number,
  ScaleFactorMeta
>({
  key: 'scaleFactor',
  codec: (config) =>
    codec<number, ScaleFactorMeta>({
      input: z.coerce
        .number()
        .int()
        .min(Math.min(...config.multipliers))
        .max(Math.max(...config.multipliers))
        .optional(),
      output: z
        .number()
        .int()
        .min(Math.min(...config.multipliers))
        .max(Math.max(...config.multipliers)),
    }),
  options: (config, args) => {
    const { multipliers, maxOutputResolution } = config;
    const maxDimension =
      args.sourceWidth && args.sourceHeight
        ? Math.max(args.sourceWidth, args.sourceHeight)
        : undefined;

    const fits = (m: number) => !maxDimension || m * maxDimension <= maxOutputResolution;
    const options: ScaleFactorOption[] = multipliers.map((m) => ({
      value: m,
      label: `x${m}`,
      disabled: !fits(m),
      targetWidth: args.sourceWidth ? m * args.sourceWidth : 0,
      targetHeight: args.sourceHeight ? m * args.sourceHeight : 0,
    }));
    const firstValid = options.find((o) => !o.disabled)?.value ?? multipliers[0]!;

    return {
      default: firstValid,
      meta: {
        options,
        canUpscale: !maxDimension || maxDimension * Math.min(...multipliers) <= maxOutputResolution,
        sourceWidth: args.sourceWidth,
        sourceHeight: args.sourceHeight,
        maxOutputResolution,
      },
    };
  },
  correct: (value, config, args) => {
    const maxDimension =
      args.sourceWidth && args.sourceHeight
        ? Math.max(args.sourceWidth, args.sourceHeight)
        : undefined;
    if (!maxDimension || value * maxDimension <= config.maxOutputResolution) return undefined;
    const firstValid =
      config.multipliers.find((m) => m * maxDimension <= config.maxOutputResolution) ??
      config.multipliers[0]!;
    return {
      value: firstValid,
      reason: 'exceeds_max_resolution',
      detail: { maxOutputResolution: config.maxOutputResolution },
    };
  },
});
