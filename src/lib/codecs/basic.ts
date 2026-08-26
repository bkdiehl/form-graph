import { z } from 'zod';
import { codec } from '../core/index.js';

/**
 * Phase-2 ports of common.ts's simple node builders. Same input/output
 * semantics as v1; every codec here is meant to be built ONCE at module scope
 * (see the codec-churn rule).
 */

export interface SliderMeta {
  min: number;
  max: number;
  step: number;
  presets?: { label: string; value: number }[];
}

function snapToStep(val: number, step: number, min: number, max: number): number {
  const snapped = Math.round((val - min) / step) * step + min;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(10))));
}

/** Port of sliderNode. Boundary values snap to step; trusted writes snap via coerce. */
export function sliderCodec(opts: {
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
      .transform((v) => (v === undefined ? undefined : snapToStep(v, step, min, max))),
    output: z.number().min(min).max(max),
    default: opts.default ?? min,
    coerce: (raw) => snapToStep(Number(raw), step, min, max),
    meta: { min, max, step, presets: opts.presets },
  });
}

export const MAX_SEED = 4294967967;

/** Port of seedNode: null (UI clear) and numeric strings (URLs) normalise. */
export function seedCodec() {
  return codec<number | undefined>({
    input: z
      .union([z.null(), z.undefined(), z.coerce.number().int().min(1).max(MAX_SEED)])
      .optional()
      .transform((v) => (v === null ? undefined : v)),
    output: z.number().int().min(1).max(MAX_SEED).optional(),
  });
}

export interface EnumOption<T extends string | number> {
  label: string;
  value: T;
  disabled?: boolean;
  memberOnly?: boolean;
}

export interface EnumMeta<T extends string | number> {
  options: EnumOption<T>[];
}

/**
 * Port of enumNode. Numeric enums coerce string input (SegmentedControl passes
 * strings) via `coerce`, so trusted writes normalise without a schema run.
 */
export function enumCodec<const T extends string | number>(opts: {
  options: EnumOption<T>[];
  default: T;
}) {
  const values = opts.options.map((o) => o.value);
  const numeric = typeof values[0] === 'number';
  const isValid = (v: unknown): v is T => values.includes(v as T);

  return codec<T, EnumMeta<T>>({
    input: z
      .unknown()
      .optional()
      .transform((raw) => {
        const candidate = numeric && typeof raw === 'string' ? Number(raw) : raw;
        return isValid(candidate) ? candidate : undefined;
      }),
    output: z.custom<T>(isValid, 'Invalid option'),
    default: opts.default,
    coerce: (raw) => {
      const candidate = numeric && typeof raw === 'string' ? Number(raw) : raw;
      return isValid(candidate) ? candidate : opts.default;
    },
    meta: { options: opts.options },
  });
}

/** Port of textNode's core: bounded text, coerced from anything stringish. */
export function textCodec(opts: { maxLength?: number; required?: boolean; default?: string } = {}) {
  const base = z.string().max(opts.maxLength ?? 6000);
  return codec<string>({
    input: z.coerce.string().optional(),
    output: opts.required ? base.min(1, 'Required') : base,
    default: opts.default ?? '',
  });
}
