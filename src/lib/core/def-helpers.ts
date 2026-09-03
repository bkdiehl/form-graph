import { z } from 'zod';
import type { FieldDef } from './graph.js';
import type { Refinable, SchemaLike } from './types.js';

/**
 * What a helper's built-in output guarantees: a schema you can `.refine` for
 * per-pass narrowing (the spread-and-narrow pattern), WITHOUT dragging the
 * schema library's full generic surface into the public types — raw zod types
 * here measured 89k type instantiations against the 60k budget. The
 * `textOf({ output })` override keeps the caller's exact type instead: the
 * caller already paid for it.
 */
export type RefinableSchema<T> = SchemaLike<T> & Refinable<T>;

/**
 * PROTOTYPE E definition helpers. Each returns a fresh FieldDef per call
 * (cheap), but the SCHEMAS inside are cached automatically, keyed on the
 * exact values they are built from — the inputs ARE the dependency array, so
 * there is nothing to declare and staleness is impossible. Meta (presets,
 * labels, disabled flags) is deliberately outside the cache key: it rebuilds
 * fresh every pass, and the snapshot diff already handles structural
 * equality.
 */
const schemaCache = new Map<string, unknown>();
const memo = <S>(key: string, build: () => S): S => {
  let hit = schemaCache.get(key) as S | undefined;
  if (hit === undefined) {
    hit = build();
    schemaCache.set(key, hit);
  }
  return hit;
};

/**
 * The same caching the built-in helpers use, packaged for an app's OWN def
 * factories: the factory's result is built once per distinct config and
 * reused on every later call — which is what makes calling it from a field
 * factory (re-run every resolve pass) free after the first pass.
 *
 * The config is the cache key (JSON-serialized), so it must be
 * JSON-serializable and function-free; pass `keyOf` to key on something
 * narrower. Unlike the built-ins, this caches the WHOLE def — meta included —
 * so per-pass meta belongs at the call site (spread the cached def and
 * override), not in the config. `defFamily` is the primitive-args sibling for
 * ctx-dependent schemas, where the author names the deps explicitly.
 */
export function cachedFactory<A extends unknown[], R>(
  build: (...args: A) => R,
  keyOf: (...args: A) => string = (...args) => JSON.stringify(args)
): (...args: A) => R {
  const cache = new Map<string, R>();
  return (...args: A): R => {
    const key = keyOf(...args);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const made = build(...args);
    cache.set(key, made);
    return made;
  };
}

function snapToStep(val: number, step: number, min: number, max: number): number {
  const snapped = Math.round((val - min) / step) * step + min;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(10))));
}

export interface SliderDefMeta {
  min: number;
  max: number;
  step: number;
  presets?: { label: string; value: number }[];
}

export function slider(cfg: {
  min: number;
  max: number;
  step?: number;
  default?: number;
  presets?: { label: string; value: number }[];
}): FieldDef<number, SliderDefMeta, RefinableSchema<number>> {
  const { min, max, step = 1 } = cfg;
  const schemas = memo(`slider|${min}|${max}|${step}`, () => ({
    input: z.coerce
      .number()
      .optional()
      .transform((v) => (v === undefined ? undefined : snapToStep(v, step, min, max))),
    output: z.number().min(min).max(max),
    coerce: (raw: unknown) => snapToStep(Number(raw), step, min, max),
  }));
  return {
    ...schemas,
    default: cfg.default ?? min,
    meta: { min, max, step, ...(cfg.presets ? { presets: cfg.presets } : {}) },
  };
}

export interface EnumDefOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface EnumDefMeta<T extends string | number> {
  options: EnumDefOption<T>[];
}

/**
 * A closed option set. `gate` is the single-declaration availability rule
 * (helper-level sugar, not a core mechanism): a string gates that option —
 * rendered disabled AND, if the value sits on it, corrected to the first
 * open option with the string as the reason.
 */
export function enumOf<const T extends string | number>(cfg: {
  options: EnumDefOption<T>[];
  default: T;
  gate?: Partial<Record<T, string | false | null | undefined>>;
}): FieldDef<T, EnumDefMeta<T>, RefinableSchema<T>> {
  const values = cfg.options.map((o) => o.value);
  const numeric = typeof values[0] === 'number';
  const isValid = (v: unknown): v is T => values.includes(v as T);
  const schemas = memo(`enum|${values.join('\u0000')}`, () => ({
    input: z
      .unknown()
      .optional()
      .transform((raw) => {
        const candidate = numeric && typeof raw === 'string' ? Number(raw) : raw;
        return isValid(candidate) ? candidate : undefined;
      }),
    output: z.custom<T>(isValid, 'Invalid option'),
    coerce: (raw: unknown) => {
      const candidate = numeric && typeof raw === 'string' ? Number(raw) : raw;
      return isValid(candidate) ? (candidate as T) : cfg.default;
    },
  }));

  const gates = (cfg.gate ?? {}) as Partial<Record<T, string | false | null | undefined>>;
  const options = cfg.options.map((o) =>
    typeof gates[o.value] === 'string' ? { ...o, disabled: true } : o
  );

  return {
    input: schemas.input,
    output: schemas.output as unknown as RefinableSchema<T>,
    coerce: schemas.coerce as (raw: unknown) => T,
    default: cfg.default,
    meta: { options },
    correct: (value) => {
      const reason = gates[value];
      if (typeof reason !== 'string') return undefined;
      const target = options.find((o) => !o.disabled);
      return target && !Object.is(target.value, value)
        ? { value: target.value, reason, detail: { gated: value } }
        : undefined;
    },
  };
}

/**
 * A text field. The INPUT stays lenient regardless of the output — that's the
 * dual-schema contract that lets a field HOLD a half-typed invalid value
 * (rejected only at submit) instead of snapping to the default while typing.
 * `output` overrides the strict contract (formats, messages) without giving
 * that up:
 *
 *   textOf({ output: z.string().email('A valid email is required') })
 */
export function textOf(cfg?: {
  maxLength?: number;
  required?: boolean;
  default?: string;
}): FieldDef<string, undefined, RefinableSchema<string>>;
export function textOf<O extends SchemaLike<string>>(cfg: {
  maxLength?: number;
  required?: boolean;
  default?: string;
  output: O;
}): FieldDef<string, undefined, O>;
export function textOf(
  cfg: {
    maxLength?: number;
    required?: boolean;
    default?: string;
    output?: SchemaLike<string>;
  } = {}
): FieldDef<string> {
  const { maxLength = 6000, required = false } = cfg;
  const schemas = memo(`text|${maxLength}|${required}`, () => {
    const base = z.string().max(maxLength);
    return {
      input: z.coerce.string().optional(),
      output: required ? base.min(1, 'Required') : base,
    };
  });
  return {
    ...schemas,
    ...(cfg.output ? { output: cfg.output } : {}),
    default: cfg.default ?? '',
  };
}

export function boolOf(cfg: { default?: boolean } = {}): FieldDef<boolean, undefined, RefinableSchema<boolean>> {
  const def = cfg.default ?? false;
  const schemas = memo('bool', () => ({
    input: z.boolean().optional(),
    output: z.boolean(),
  }));
  return { ...schemas, default: def };
}

/** The meta type a def declares, unwrapping the `(value) => M` function form. */
type MetaFromDef<D> = D extends { meta: infer MF }
  ? MF extends (value: never) => infer M
    ? M
    : MF
  : undefined;

/**
 * The consistency contract `defineDef` checks a literal def against: T comes
 * from the def's own `output` schema, so `default`/`coerce`/`correct`/
 * `toOutput`/`meta` are validated against it — the same checking as
 * `satisfies FieldDef<T, M>` without naming T.
 */
type ConsistentDef<D> = D extends { output: SchemaLike<infer T> }
  ? FieldDef<T, MetaFromDef<D>, SchemaLike<T>>
  : FieldDef<unknown>;

/**
 * Identity wrapper for hand-written defs and def-factory returns. Use it
 * INSTEAD of a return-type annotation: annotating `: FieldDef<T, M>` widens
 * `input` to `SchemaLike<unknown>`, which silently erases the def's typed
 * write path (`DefInputValue` falls back to the parsed value type and
 * controllers stop accepting raw input shapes). `defineDef` validates the
 * object the way `satisfies FieldDef<T, M>` does — T inferred from `output` —
 * while preserving the concrete schema types. One difference from
 * `satisfies`: callback params (`correct`, `meta`, `coerce`) get no
 * contextual type here, so annotate them; the check still rejects a wrong
 * annotation.
 */
export function defineDef<const D extends { output: SchemaLike<unknown> }>(
  def: D & ConsistentDef<D>
): D {
  return def;
}
