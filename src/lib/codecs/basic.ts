import { z } from 'zod';
import { codec } from '../core/index.js';

/**
 * The primitive codecs: bounded numbers, closed option sets, bounded text.
 * Every codec here is meant to be built ONCE at module scope (see the
 * codec-churn rule).
 */

export interface NumberMeta {
  min: number;
  max: number;
  step: number;
}

function snapToStep(val: number, step: number, min: number, max: number): number {
  const snapped = Math.round((val - min) / step) * step + min;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(10))));
}

/** A bounded number. Boundary values snap to step; trusted writes snap via coerce. */
export function numberCodec(opts: { min: number; max: number; step?: number; default?: number }) {
  const { min, max, step = 1 } = opts;
  return codec<number, NumberMeta>({
    input: z.coerce
      .number()
      .optional()
      .transform((v) => (v === undefined ? undefined : snapToStep(v, step, min, max))),
    output: z.number().min(min).max(max),
    default: opts.default ?? min,
    coerce: (raw) => snapToStep(Number(raw), step, min, max),
    meta: { min, max, step },
  });
}

export interface EnumOption<T extends string | number> {
  label: string;
  value: T;
  disabled?: boolean;
}

export interface EnumMeta<T extends string | number> {
  options: EnumOption<T>[];
}

/**
 * A closed set of options. Numeric enums coerce string input (segmented
 * controls pass strings) via `coerce`, so trusted writes normalise without a
 * schema run.
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

/** Bounded text, coerced from anything stringish. */
export function textCodec(opts: { maxLength?: number; required?: boolean; default?: string } = {}) {
  const base = z.string().max(opts.maxLength ?? 6000);
  return codec<string>({
    input: z.coerce.string().optional(),
    output: opts.required ? base.min(1, 'Required') : base,
    default: opts.default ?? '',
  });
}
