/**
 * Structural schema contract. Satisfied by zod 3 and 4 as-is, and by hand-written
 * schemas in tests — the core never imports zod, so the engine is testable and
 * versionable independently of the validation library.
 */
export interface Schema<T = unknown> {
  parse(value: unknown): T;
  safeParse(value: unknown): SafeParseResult<T>;
}

/**
 * The subset of Standard Schema (https://standardschema.dev) the core accepts —
 * zod 4, valibot, and arktype all implement it, so any of them works as a codec
 * schema without adapters. Sync only: an async validator is rejected at runtime
 * (resolution is synchronous by design).
 */
export interface StandardSchemaV1<T = unknown> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => StandardSchemaResult<T> | Promise<StandardSchemaResult<T>>;
  };
}

export type StandardSchemaResult<T> =
  | { readonly value: T; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<SchemaIssue> };

/** Anything a codec may carry as a schema. */
export type SchemaLike<T = unknown> = Schema<T> | StandardSchemaV1<T>;

/**
 * The raw shape a schema ACCEPTS — its Standard Schema input type (zod's
 * `z.input`). `unknown` when the schema type is erased (an annotated def) or
 * carries no input typing.
 */
export type InferSchemaInput<S> = S extends {
  '~standard': { types?: { input: infer I } | undefined };
}
  ? I
  : unknown;

/**
 * The one method `FieldOptions.refine` callbacks can rely on regardless of how
 * widened the codec's output type is — zod schemas satisfy it structurally.
 * With a concretely-typed codec the full schema type is ALSO available (the
 * callback parameter is the intersection), so .max/.min etc. work there.
 */
export interface Refinable<T> {
  refine(
    check: (value: T) => unknown,
    opts?: string | { message?: string; params?: Record<string, unknown> }
  ): SchemaLike<T>;
}

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: ReadonlyArray<SchemaIssue> } };

export interface SchemaIssue {
  message: string;
  code?: string;
  path?: ReadonlyArray<PropertyKey>;
}

/**
 * All of a field's validation failures, normalized to SchemaIssue so the shape
 * is identical whether the codec is zod or Standard Schema. `message`/`code`
 * mirror the first issue for the common render-one-message case; `issues`
 * carries every failure, with `path` relative to the field — which item of an
 * array field failed lives there.
 */
export interface FieldError {
  message: string;
  code: string;
  issues: ReadonlyArray<SchemaIssue>;
}

/**
 * The dual-schema contract, per field.
 *
 * `input` and `output` deliberately differ: input is lenient and runs only at
 * untrusted boundaries, output is strict and runs only on demand. See
 * docs/data-graph-rethink.md §10.
 */
export interface Codec<T = unknown, M = unknown> {
  /** Strict contract for validate()/output()/server parse. */
  output: SchemaLike<T>;
  /**
   * Lenient parse for values arriving from storage, remix, URL params, raw
   * server input. Deliberately untyped against T — leniency means it may
   * produce fragments of the state type; `output` is the contract. A result of
   * `undefined` means "no usable value" and falls through to the default.
   */
  input?: SchemaLike<unknown>;
  default?: T | (() => T);
  /**
   * The codec's CONTRIBUTION to the field's meta — the unconditional and
   * contract-derived props, as a PARTIAL. A prop whose value is conditional
   * belongs at the field call, not here: omit it, and the field's meta patch
   * states it once. The function form (derived from the resolved value)
   * returns the full shape.
   */
  meta?: Partial<M> | ((value: T) => M);
  /** Opt-in normalisation for trusted set() writes (enum coercion, step snapping). */
  coerce?: (raw: unknown) => T;
  /** Projection to the submission shape when state holds more than the server wants (enriched resources). */
  toOutput?: (value: T) => unknown;
}

/**
 * Something the resolver decided that the caller may want to observe — a value
 * corrected into range, a stored choice that no longer applies.
 *
 * An alternative is a mutable collector hung on the external context, which has
 * to be freshly built per request or it leaks between them. Here it is part of
 * the resolution's return value: deterministic, per-call, and impossible to
 * share by accident.
 */
export interface ResolutionNote {
  key: string;
  kind: string;
  detail?: Record<string, unknown>;
}

export interface FieldRecord<T = unknown, M = unknown> {
  key: string;
  /** Intent address this field resolved with — `key` unscoped, `key@scope` scoped. */
  address: string;
  value: T;
  meta: M | undefined;
  /** The value-derived meta function, kept so f.correct can recompute meta. */
  metaFn: ((value: unknown) => unknown) | undefined;
  codec: Codec<T, M> | undefined;
  isComputed: boolean;
  /**
   * Wire disposition: undefined emits under the graph key, a string emits
   * under that name instead, false keeps the key out of parsed data entirely
   * (it still resolves, validates, and holds intent). Validation errors key by
   * the WIRE name — the external contract — except emit:false fields, which
   * key by graph name (they have no wire name).
   */
  emit?: false | string;
  /** Set when a boundary value failed its input schema and the default was used instead. */
  boundaryError: FieldError | undefined;
  /** The refined output schema for this pass (FieldOptions.refine); replaces codec.output at submit. */
  refined: SchemaLike<unknown> | undefined;
  /** Live refinement failure — a value the user must resolve. */
  refineError: FieldError | undefined;
  /** The correction note from this pass, when `correct` replaced the value. */
  note: ResolutionNote | undefined;
}

export interface FieldSnapshot<T = unknown, M = unknown> {
  key: string;
  value: T;
  meta: M | undefined;
  error: FieldError | undefined;
  /** Set when `correct` replaced this value this pass — render "we adjusted this" inline. */
  note: ResolutionNote | undefined;
  isComputed: boolean;
}

export interface Snapshot<State> {
  state: State;
  fields: ReadonlyMap<string, FieldSnapshot>;
  /** Active field keys in declaration order — drives auto-rendered forms. */
  keys: readonly string[];
}

export type ValidationResult<Data, State> =
  | {
      success: true;
      data: Data;
      state: State;
      notes?: readonly ResolutionNote[];
      /**
       * Keys whose values are DERIVED (computed), not user input —
       * `result.nodes` partition. The server strips these from persisted
       * params so remix never replays derived values as if typed.
       */
      computedKeys?: readonly string[];
    }
  | { success: false; errors: Record<string, FieldError>; notes?: readonly ResolutionNote[] };
