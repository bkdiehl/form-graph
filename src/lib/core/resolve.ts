import { readEntry, type Intent, type ParseCache, type PendingValues } from './intent.js';
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
export interface FieldOptions<T, M, O extends SchemaLike<T> = SchemaLike<T>> {
  /**
   * Where this field's memory lives. Scope values are computed by the resolver
   * (an ecosystem key, a model id, a toggle) and become part of the intent
   * address, so `steps` scoped per ecosystem group remembers a value per group.
   * Conditional scoping is a ternary at the call site.
   */
  scope?: Scope;
  /** Overrides the codec default — for call-site defaults that depend on context. */
  default?: T | (() => T);
  /**
   * Overrides the codec meta — for dynamic UI props derived from ctx/ext. A
   * function form receives the RESOLVED value (after default + correction),
   * for metas derived from it, e.g. a picker's excludeIds.
   */
  meta?: M | ((value: T) => M);
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
export interface Fields {
  field<T, M, O extends SchemaLike<T> = SchemaLike<T>>(
    key: string,
    codec: Codec<T, M> & { output: O },
    opts?: FieldOptions<T, M, O>
  ): T;
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
    private readonly refineCache: RefineCache
  ) {}

  field<T, M, O extends SchemaLike<T> = SchemaLike<T>>(
    key: string,
    codec: Codec<T, M> & { output: O },
    opts?: FieldOptions<T, M, O>
  ): T {
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
    // matching v1, where a node's stored `undefined` yields its defaultValue.
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

    const rawMeta = opts && 'meta' in opts ? opts.meta : codec.meta;
    const metaFn = typeof rawMeta === 'function' ? (rawMeta as (v: T) => M) : undefined;
    const meta = metaFn ? metaFn(value as T) : (rawMeta as M | undefined);

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
  refineCache: RefineCache = new Map()
): Resolution<State> {
  const collector = new Collector(intent, cache, pending, refineCache);
  const state = resolver(collector, ext);
  return {
    state,
    records: collector.records,
    keys: collector.keys,
    notes: collector.notes,
  };
}
