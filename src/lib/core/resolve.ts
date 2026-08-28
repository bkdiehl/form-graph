import { readEntry, type Intent, type ParseCache, type PendingValues } from './intent.js';
import type { CodecRegistry, InferCodecConstraint, InferCodecMeta, InferCodecValue } from './codec.js';
import { runSchema } from './run-schema.js';
import { scopedAddress, type Scope } from './scope.js';
import { toFieldError } from './intent.js';
import type { Codec, FieldRecord, Refinable, ResolutionNote, SchemaLike } from './types.js';

/**
 * The per-field pipeline, in the order it runs on EVERY pass:
 *
 *   stored intent → input schema (boundary values only) → `default` (if empty)
 *   → the value the resolver receives → `refine` judges it
 *
 * The strict output schema (refined, if `refine` is set) then runs only on
 * demand: submit, `output()`, server `parse()`.
 *
 * Options are purely DECLARATIVE — schemas and config. Logic lives in the
 * resolver as code, including correction: `f.correct(key, value, reason)` is
 * a statement right after the field it fixes (see {@link Fields.correct}).
 * The remaining declarative reaction to a bad value is `refine`: it REFUSES —
 * the value stays, the field carries a live error, and submit fails. For
 * mismatches the USER must resolve: a gated option, a forbidden combination.
 */
export interface FieldOptions<T, M, O extends SchemaLike<T> = SchemaLike<T>, C = never> {
  /**
   * Where this field's memory lives. Scope values are computed by the resolver
   * (a discriminant, an id, a toggle) and become part of the intent
   * address, so `steps` scoped per group remembers a value per group.
   * Conditional scoping is a ternary at the call site.
   */
  scope?: Scope;
  /** Overrides the codec default — for call-site defaults that depend on context. */
  default?: T | (() => T);
  /**
   * Per-pass meta. The OBJECT form is a PATCH: shallow-merged over the codec's
   * own meta, so a conditional prop is stated ONCE, here. A fully conditional
   * prop is omitted from the codec and given both arms at the field; a
   * default-with-exception patches only the exception, keeping the codec's
   * value otherwise:
   *
   *   meta: business ? { placeholder: 'billing@acme.com' } : {}
   *
   * The FUNCTION form takes full control: it receives the RESOLVED value
   * (after default + correction) and the codec's contribution as `base`, and
   * its return REPLACES.
   */
  meta?: Partial<M> | ((value: T, base: Partial<M> | undefined) => M);
  /**
   * Narrows the codec's OUTPUT schema under this pass's conditions, in the
   * schema library's own vocabulary: `(s) => s.refine(...)` for zod. A failing
   * value keeps its place, carries a live `error` on the snapshot, and fails
   * submit/parse. Pair with `refineDeps` — the built schema is cached and only
   * reconstructed when the deps change, keeping schema construction off the
   * keystroke path.
   */
  refine?: (output: O & Refinable<T>) => SchemaLike<T>;
  /**
   * The values `refine` closes over (React-style deps array, shallow-compared).
   * Omitted deps mean a stale refinement: list everything the refine reads.
   */
  refineDeps?: readonly unknown[];
  /**
   * A per-pass restriction stated ONCE, in the codec's own constraint
   * vocabulary (`Codec.constrain` defines what `C` is — excluded options for
   * an enum, tightened bounds for a number, a compatibility rule for a
   * picker). The codec derives both halves from it: the presentation in its
   * meta, and the admitted value — a moved value is recorded as a correction
   * with the codec-returned reason. `undefined` means unconstrained.
   */
  constrain?: C;
}

/** Persistent cache of built refinements, keyed by field key. Held by the store across passes. */
export type RefineCache = Map<string, { deps: readonly unknown[]; schema: SchemaLike<unknown> }>;

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}

/**
 * Handed to a resolver. `field`/`computed` return the resolved value so the
 * resolver body reads like plain code — a dependency is a variable reference,
 * ordering is line order, a conditional field is an `if`, a branch is a `switch`.
 */
export interface Fields<Codecs extends CodecRegistry = CodecRegistry> {
  field<T, M, C, O extends SchemaLike<T> = SchemaLike<T>>(
    key: string,
    codec: Codec<T, M, C> & { output: O },
    opts?: FieldOptions<T, M, O, C>
  ): T;
  /**
   * Registry form: the codec comes from the form's `codecs` slot, so a
   * registered field needs no repetition at the call site. Typed per key when
   * the resolver's `f` is `Fields<typeof codecs>` (which `defineForm` provides
   * to inline resolvers); throws at resolve time for an unregistered key.
   */
  field<K extends keyof Codecs & string>(
    key: K,
    opts?: FieldOptions<
      InferCodecValue<Codecs[K]>,
      InferCodecMeta<Codecs[K]>,
      SchemaLike<InferCodecValue<Codecs[K]>>,
      InferCodecConstraint<Codecs[K]>
    >
  ): InferCodecValue<Codecs[K]>;
  computed<T>(key: string, value: T): T;
  /**
   * Replaces an already-declared field's value and records why — correction
   * as a visible STATEMENT in the resolver, not a hidden pipeline step:
   *
   *   let ramGb = f.field('ramGb', RAM, { scope: preset });
   *   if (ramGb > maxRam) ramGb = f.correct('ramGb', maxRam, 'ram_ceiling');
   *
   * Updates the field's state/output/snapshot value (and its meta, when the
   * meta is value-derived), re-judges any refinement, and emits a note
   * { key, kind: reason, detail: { from, to, ...detail } }. Returns the new
   * value — reassign it so everything downstream reads the corrected value.
   * Call it immediately after the field it corrects, before any dependent
   * field reads the stale value. The original stays in intent, so a
   * correction is never destructive.
   */
  correct<T>(key: string, value: T, reason: string, detail?: Record<string, unknown>): T;
  note(note: ResolutionNote): void;
}

/**
 * The pure definition of a form: one function from (fields collector, ext) to
 * the state object.
 *
 * @typeParam Ext - The external context each pass reads (limits, user, gates).
 * @typeParam State - The RETURN type — never annotated by authors. Branch it
 *   with `switch`/`if` returning different shapes and TypeScript infers the
 *   discriminated union; `Extract<State, {...}>` narrowing flows from here.
 */
export type Resolver<Ext, State> = (f: Fields, ext: Ext) => State;

export interface Resolution<State> {
  state: State;
  records: Map<string, FieldRecord>;
  /** Declaration order. */
  keys: string[];
  notes: ResolutionNote[];
}

class Collector implements Fields {
  readonly records = new Map<string, FieldRecord>();
  readonly keys: string[] = [];
  readonly notes: ResolutionNote[] = [];

  constructor(
    private readonly intent: Intent,
    private readonly cache: ParseCache,
    private readonly pending: PendingValues | undefined,
    private readonly refineCache: RefineCache,
    private readonly registry?: CodecRegistry
  ) {}

  field<T, M, C, O extends SchemaLike<T> = SchemaLike<T>>(
    key: string,
    codecOrOpts?: (Codec<T, M, C> & { output: O }) | FieldOptions<T, M, O, C>,
    maybeOpts?: FieldOptions<T, M, O, C>
  ): T {
    // `output` is required on Codec and absent from FieldOptions — the discriminant.
    const explicit = codecOrOpts !== undefined && 'output' in codecOrOpts;
    const codec = explicit
      ? (codecOrOpts as Codec<T, M, C> & { output: O })
      : (this.registry?.[key] as (Codec<T, M, C> & { output: O }) | undefined);
    const opts = explicit ? maybeOpts : (codecOrOpts as FieldOptions<T, M, O, C> | undefined);
    if (!codec) {
      throw new Error(
        `No codec for field "${key}": pass one explicitly, or declare the key in the form's codecs.`
      );
    }
    this.assertUnique(key);

    const address = scopedAddress(key, opts?.scope);
    // Read order: pending values arrive by KEY (a patch or boundary defaults)
    // and win this pass — the store commits them at `address` afterwards. The
    // bare-key fallback serves writes made while the field was inactive (which
    // had no resolved scope); an explicit write to the active field supersedes
    // it via commitPending's cleanup.
    const entry =
      this.pending?.get(key) ??
      this.intent.get(address) ??
      (address !== key ? this.intent.get(key) : undefined);
    const parsed = entry
      ? readEntry(entry, codec as Codec<unknown, unknown>, this.cache)
      : undefined;

    // `undefined` means "no usable value" and falls through to the default —
    // a stored `undefined` yields the default, same as no entry at all.
    let value = parsed?.value as T | undefined;
    if (value === undefined) {
      value = resolveDefault(opts?.default) ?? resolveDefault(codec.default);
    }
    // Refinement: build (or reuse) the narrowed output schema and judge the
    // value now, so the error is live on the snapshot rather than appearing at
    // submit. Construction is deps-cached; per-pass cost is one safeParse.
    let refined: SchemaLike<unknown> | undefined;
    let refineError;
    if (opts?.refine) {
      const deps = opts.refineDeps ?? [];
      const hit = this.refineCache.get(key);
      if (hit && sameDeps(hit.deps, deps)) {
        refined = hit.schema;
      } else {
        refined = opts.refine(codec.output as O & Refinable<T>) as SchemaLike<unknown>;
        this.refineCache.set(key, { deps, schema: refined });
      }
      const judged = runSchema(refined, value);
      if (!judged.success) refineError = toFieldError(judged.error.issues);
    }

    const constraint = opts?.constrain;
    if (constraint !== undefined && !codec.constrain) {
      throw new Error(`Field "${key}": this codec defines no constraint vocabulary.`);
    }
    const applyConstraint =
      constraint !== undefined && codec.constrain
        ? (v: T, m: M | undefined) => codec.constrain!({ value: v, meta: m, constraint })
        : undefined;

    const overridden = opts !== undefined && 'meta' in opts;
    const rawMeta = overridden ? opts.meta : codec.meta;
    const baseFor = (v: T): Partial<M> | undefined => {
      const base = codec.meta;
      return typeof base === 'function' ? (base as (val: T) => M)(v) : (base as Partial<M> | undefined);
    };
    const patch =
      overridden && typeof rawMeta !== 'function' ? (rawMeta as Partial<M> | undefined) : undefined;
    const bareMetaFn =
      typeof rawMeta === 'function'
        ? overridden
          ? (v: T) => (rawMeta as (val: T, base: Partial<M> | undefined) => M)(v, baseFor(v))
          : (rawMeta as (v: T) => M)
        : patch !== undefined && typeof codec.meta === 'function'
          ? (v: T) => ({ ...(baseFor(v) as object), ...patch }) as M
          : undefined;
    const bareMetaAt = (v: T): M | undefined => {
      if (bareMetaFn) return bareMetaFn(v);
      if (patch !== undefined) {
        const base = baseFor(v);
        return (base === undefined ? patch : { ...(base as object), ...patch }) as M;
      }
      return rawMeta as M | undefined;
    };
    const metaFn =
      applyConstraint !== undefined
        ? (v: T) => {
            const m = bareMetaAt(v);
            return (applyConstraint(v, m).meta ?? m) as M;
          }
        : bareMetaFn;
    const constrained = applyConstraint?.(value as T, bareMetaAt(value as T));
    const meta = constrained ? ((constrained.meta ?? bareMetaAt(value as T)) as M) : bareMetaAt(value as T);

    this.record({
      key,
      address,
      value: value as T,
      meta,
      metaFn: metaFn as ((value: unknown) => unknown) | undefined,
      codec: codec as Codec<unknown, unknown>,
      isComputed: false,
      boundaryError: parsed?.error,
      refined,
      refineError,
      note: undefined,
    });

    // The other half of the constraint: a moved value is a correction, with
    // the codec-returned reason.
    if (constrained !== undefined && !Object.is(constrained.value, value)) {
      return this.correct(
        key,
        constrained.value,
        constrained.reason ?? 'constrained',
        constrained.detail
      );
    }

    return value as T;
  }

  computed<T>(key: string, value: T): T {
    this.assertUnique(key);
    this.record({
      key,
      address: key,
      value,
      meta: undefined,
      metaFn: undefined,
      codec: undefined,
      isComputed: true,
      boundaryError: undefined,
      refined: undefined,
      refineError: undefined,
      note: undefined,
    });
    return value;
  }

  correct<T>(key: string, value: T, reason: string, detail?: Record<string, unknown>): T {
    const record = this.records.get(key);
    if (!record) {
      throw new Error(`Cannot correct "${key}": no field with that key has been declared yet.`);
    }
    if (record.isComputed) {
      throw new Error(`Cannot correct "${key}": it is a computed value — compute it correctly instead.`);
    }
    const from = record.value;
    record.value = value;
    if (record.metaFn) record.meta = record.metaFn(value);
    if (record.refined) {
      const judged = runSchema(record.refined, value);
      record.refineError = judged.success ? undefined : toFieldError(judged.error.issues);
    }
    const note: ResolutionNote = { key, kind: reason, detail: { from, to: value, ...detail } };
    record.note = note;
    this.notes.push(note);
    return value;
  }

  note(note: ResolutionNote): void {
    this.notes.push(note);
  }

  private record(record: FieldRecord): void {
    this.records.set(record.key, record);
    this.keys.push(record.key);
  }

  private assertUnique(key: string): void {
    if (this.records.has(key)) {
      throw new Error(
        `Duplicate field "${key}" in one resolution. Two sections declared the same key; ` +
          `hoist it to the parent resolver or rename one.`
      );
    }
  }
}

function resolveDefault<T>(def: T | (() => T) | undefined): T | undefined {
  return typeof def === 'function' ? (def as () => T)() : def;
}

/**
 * Runs a resolver against intent. Pure given (resolver, intent, ext) — the cache
 * only memoises boundary parsing, so it never changes the result.
 */
export function resolve<Ext, State>(
  resolver: Resolver<Ext, State>,
  intent: Intent,
  ext: Ext,
  cache: ParseCache = new WeakMap(),
  pending?: PendingValues,
  refineCache: RefineCache = new Map(),
  codecs?: CodecRegistry
): Resolution<State> {
  const collector = new Collector(intent, cache, pending, refineCache, codecs);
  const state = resolver(collector, ext);
  return {
    state,
    records: collector.records,
    keys: collector.keys,
    notes: collector.notes,
  };
}
