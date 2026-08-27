import { readEntry, type Intent, type ParseCache, type PendingValues } from './intent.js';
import { runSchema } from './run-schema.js';
import { scopedAddress, type Scope } from './scope.js';
import { toFieldError } from './intent.js';
import type { Codec, FieldRecord, Refinable, ResolutionNote, SchemaLike } from './types.js';

/**
 * The per-field pipeline, in the order it runs on EVERY pass:
 *
 *   stored intent → input schema (boundary values only) → `default` (if empty)
 *   → `correct` → the value the resolver receives → `refine` judges it
 *
 * The strict output schema (refined, if `refine` is set) then runs only on
 * demand: submit, `output()`, server `parse()`.
 *
 * Two reactions to a value the current conditions don't allow — schemas judge,
 * functions transform:
 * - `correct` REPLACES it, silently and per pass, with an audit note. For
 *   mismatches the SYSTEM caused: a stored value whose option was retired, a
 *   ceiling another field lowered. State can never hold a value `correct`
 *   would reject.
 * - `refine` REFUSES it: the value stays, the field carries a live error, and
 *   submit fails. For mismatches the USER must resolve: a gated option, a
 *   forbidden combination.
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
   * Per-pass correction: return the value unchanged, or
   * `corrected(newValue, reason)` to replace it and record why. Runs after the
   * default resolves, so everything downstream — the resolver's variable, other
   * fields' options, computed fields, state, output — sees the corrected value.
   * The original stays in intent, so a correction is never destructive: restore
   * the conditions and the user's value returns.
   */
  correct?: (value: T) => T | Corrected<T>;
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

/** The marker `correct` returns to replace a value AND record why. */
export interface Corrected<T> {
  readonly [CORRECTED]: true;
  readonly value: T;
  readonly reason: string;
  readonly detail?: Record<string, unknown>;
}

const CORRECTED = Symbol.for('form-graph.corrected');

/**
 * Wraps a replacement value with its machine-readable reason (and optional
 * extra detail). The engine unwraps it: state gets `value`, and a note
 * `{ key, kind: reason, detail: { from, to, ...detail } }` is recorded —
 * `key`/`from`/`to` are filled in automatically.
 */
export function corrected<T>(
  value: T,
  reason: string,
  detail?: Record<string, unknown>
): Corrected<T> {
  return { [CORRECTED]: true, value, reason, detail };
}

function isCorrected<T>(result: T | Corrected<T>): result is Corrected<T> {
  return typeof result === 'object' && result !== null && CORRECTED in result;
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
    let note: ResolutionNote | undefined;
    if (opts?.correct) {
      const before = value as T;
      const result = opts.correct(before);
      if (isCorrected(result)) {
        value = result.value;
        note = {
          key,
          kind: result.reason,
          detail: { from: before, to: result.value, ...result.detail },
        };
        this.note(note);
      } else {
        value = result;
      }
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
    const meta = typeof rawMeta === 'function' ? (rawMeta as (v: T) => M)(value as T) : rawMeta;

    this.record({
      key,
      address,
      value: value as T,
      meta,
      codec: codec as Codec<unknown, unknown>,
      isComputed: false,
      boundaryError: parsed?.error,
      refined,
      refineError,
      note,
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
      codec: undefined,
      isComputed: true,
      boundaryError: undefined,
      refined: undefined,
      refineError: undefined,
      note: undefined,
    });
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
