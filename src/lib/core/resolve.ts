import { deepEqual } from './deep-equal.js';
import { readEntry, type Intent, type ParseCache, type PendingValues } from './intent.js';
import { scopedAddress, type Scope } from './scope.js';
import type { Codec, FieldRecord } from './types.js';

export interface FieldOptions<T, M> {
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
   * function form receives the RESOLVED value (after default + projection),
   * for metas derived from it, e.g. a picker's excludeIds.
   */
  meta?: M | ((value: T) => M);
  /**
   * Applied every pass, after the default resolves. Replaces v1's `transform`
   * plus the effects that existed only to clamp a value back into range: a value
   * that can't survive projection simply never appears in state.
   */
  project?: (value: T) => T;
  /**
   * Per-pass output constraint, checked alongside the codec's output schema.
   * For ext-dependent rules that must ERROR rather than clamp (a gated
   * workflow rejecting on submit) — `project` silently corrects, this refuses.
   * Return an error message, or undefined when valid.
   */
  validate?: (value: T) => string | undefined;
  /**
   * Called only when `project` actually changed the value, to describe the
   * adjustment. This is how a silent clamp becomes observable without the
   * resolver having to re-derive whether it fired.
   */
  noteOnProject?: (from: T, to: T) => ResolutionNote;
}

/**
 * Something the resolver decided that the caller may want to observe — a value
 * clamped into range, a stored choice that no longer applies.
 *
 * v1 carries this as a mutable collector hung on the external context, which has
 * to be freshly built per request or it leaks between them. Here it is part of
 * the resolution's return value: deterministic, per-call, and impossible to
 * share by accident.
 */
export interface ResolutionNote {
  key: string;
  kind: string;
  detail?: Record<string, unknown>;
}

/**
 * Handed to a resolver. `field`/`computed` return the resolved value so the
 * resolver body reads like plain code — a dependency is a variable reference,
 * ordering is line order, a conditional field is an `if`, a branch is a `switch`.
 */
export interface Fields {
  field<T, M>(key: string, codec: Codec<T, M>, opts?: FieldOptions<T, M>): T;
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
    private readonly pending: PendingValues | undefined
  ) {}

  field<T, M>(key: string, codec: Codec<T, M>, opts?: FieldOptions<T, M>): T {
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
    if (opts?.project) {
      const before = value as T;
      value = opts.project(before);
      if (opts.noteOnProject && !deepEqual(before, value)) {
        this.note(opts.noteOnProject(before, value as T));
      }
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
      validate: opts?.validate as ((value: unknown) => string | undefined) | undefined,
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
  pending?: PendingValues
): Resolution<State> {
  const collector = new Collector(intent, cache, pending);
  const state = resolver(collector, ext);
  return {
    state,
    records: collector.records,
    keys: collector.keys,
    notes: collector.notes,
  };
}
