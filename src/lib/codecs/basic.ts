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

/**
 * numberCodec's constraint vocabulary: per-pass bounds, stated once. The codec
 * derives both halves — meta min/max tighten, and an out-of-bounds value
 * corrects (clamped and step-snapped) with the constraint's reason.
 */
export interface NumberConstraint {
  min?: number;
  max?: number;
  reason: string;
}

/** A bounded number. Boundary values snap to step; trusted writes snap via coerce. */
export function numberCodec(opts: { min: number; max: number; step?: number; default?: number }) {
  const { min, max, step = 1 } = opts;
  return codec<number, NumberMeta, NumberConstraint>({
    input: z.coerce
      .number()
      .optional()
      .transform((v) => (v === undefined ? undefined : snapToStep(v, step, min, max))),
    output: z.number().min(min).max(max),
    default: opts.default ?? min,
    coerce: (raw) => snapToStep(Number(raw), step, min, max),
    meta: { min, max, step },
    constrain: ({ value, meta, constraint }) => {
      const lo = Math.max(min, constraint.min ?? min);
      const hi = Math.min(max, constraint.max ?? max);
      const admitted = snapToStep(value, step, lo, hi);
      return {
        value: admitted,
        meta: { ...(meta ?? { min, max, step }), min: lo, max: hi },
        reason: constraint.reason,
        detail: { min: lo, max: hi },
      };
    },
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
 * enumCodec's constraint vocabulary: per-option exclusions, stated once. A
 * string gates that option — disabled in meta, and a value sitting on it
 * corrects to the first enabled option with the string as the reason. Falsy
 * entries are open.
 */
export type EnumConstraint<T extends string | number> = {
  [K in T]?: string | false | null | undefined;
};

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

  return codec<T, EnumMeta<T>, EnumConstraint<T>>({
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
    constrain: ({ value, meta, constraint }) => {
      const options = (meta?.options ?? opts.options).map((o) => {
        const reason = constraint[o.value];
        return typeof reason === 'string' ? { ...o, disabled: true } : o;
      });
      const reason = constraint[value];
      if (typeof reason !== 'string') return { value, meta: { ...meta, options } };
      const target = options.find((o) => !o.disabled);
      return {
        value: target ? target.value : value,
        meta: { ...meta, options },
        reason,
        detail: { gated: value },
      };
    },
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
