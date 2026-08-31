import { intentFromRaw, type Intent } from './intent.js';
import { resolve, type Fields, type Resolution } from './resolve.js';
import { FormStore, type PatchReconciler, type StoreOptions } from './store.js';
import { compileRules, type RuleMap, type RuleUnit } from './rules.js';
import { validateResolution } from './validate.js';
import type { CodecRegistry } from './codec.js';
import type { Codec, FieldError, ValidationResult } from './types.js';

/** What the `defs` slot accepts per key: a definition/codec, or a kit (unwrapped). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DefsInput = Record<string, Codec<any, any> | { codec: Codec<any, any> }>;

/** The registry after kit unwrapping — what FormDefinition/FormStore carry. */
export type NormalizeDefs<C> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof C]: C[K] extends { codec: infer X extends Codec<any, any> }
    ? X
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Extract<C[K], Codec<any, any>>;
};

/**
 * @typeParam Ext - See {@link defineForm}: annotated by the caller.
 * @typeParam State - See {@link defineForm}: inferred from `resolve`'s return.
 * @typeParam Codecs - See {@link defineForm}: inferred from the `defs` slot.
 */
export interface FormConfig<Ext, State, Codecs extends DefsInput = CodecRegistry> {
  resolve: (f: Fields<NormalizeDefs<Codecs>>, ext: Ext) => State;
  /**
   * The form's codec registry: every field key mapped to its codec — or to a
   * FIELD KIT, whose codec is unwrapped, so kit-built fields register without
   * repeating `.codec`. This is what lets bindings derive each key's
   * value/meta types FROM THE FORM — `typedFields(store)` and `<Field>` need
   * no separate registry export. Purely additive: forms without it still work,
   * their fields just type as unknown in registry-driven helpers.
   */
  defs?: Codecs;
  /**
   * Rewrites a patch before it reaches intent — the home for conflicts between
   * two user choices. Runs once, before
   * resolution, so there is no loop to detect.
   *
   * An array of PLAIN RULE MAPS (trigger field -> rule), rule units carrying
   * a `reconciler` (field kits, `graph.effects` spreads), and bare reconciler
   * functions — composed left-to-right, each seeing the accumulated patch.
   * Declare hub entries before branch entries so branch rules see the hub's
   * corrections.
   */
  reconcile?: ReconcileEntry<State, Ext> | readonly ReconcileEntry<State, Ext>[];
}

type ReconcileEntry<State, Ext> =
  | PatchReconciler<State, Ext>
  | RuleUnit<State, Ext>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | RuleMap<State, Ext>;

const toRule = <State, Ext>(entry: ReconcileEntry<State, Ext>): PatchReconciler<State, Ext> =>
  typeof entry === 'function'
    ? entry
    : 'reconciler' in entry
      ? (entry as RuleUnit<State, Ext>).reconciler
      : compileRules(entry as RuleMap<State, Ext>);

function composeReconcilers<State, Ext>(
  reconcile: FormConfig<Ext, State>['reconcile']
): PatchReconciler<State, Ext> | undefined {
  if (!reconcile) return undefined;
  const rules = (Array.isArray(reconcile) ? reconcile : [reconcile]).map(toRule);
  return (patch, state, ext) => rules.reduce((acc, rule) => rule(acc, state, ext), patch);
}

/**
 * @typeParam State - The state union, inferred from the resolver.
 * @typeParam Ext - The external-context type, annotated at {@link defineForm}.
 * @typeParam Codecs - The registry from the config's `defs` slot —
 *   carried here (and onto the store) so bindings can derive per-key
 *   value/meta types from the form itself.
 */
export class FormDefinition<State, Ext, Codecs extends CodecRegistry = CodecRegistry> {
  /** The registry from the config (kits unwrapped to their codecs; empty if none given). */
  readonly defs: Codecs;

  constructor(private readonly config: FormConfig<Ext, State, DefsInput>) {
    const normalized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(config.defs ?? {})) {
      normalized[key] = entry && 'codec' in entry ? entry.codec : entry;
    }
    this.defs = normalized as Codecs;
  }

  /**
   * One-shot resolution over KEY-addressed values (raw server input,
   * introspection pins). They run through the pending layer, so scoped fields
   * find them by key — scope buckets are a store concern, invisible here.
   */
  resolve(valuesByKey: Intent, ext: Ext): Resolution<State> {
    return resolve(this.config.resolve, new Map(), ext, new WeakMap(), valuesByKey, this.defs);
  }

  /**
   * The server entry point, and the same pipeline the client walks: boundary
   * codecs -> resolve -> output validation. Pure — no store, no clone, no
   * shared mutable template.
   *
   * `data` is typed as `State`: the output view holds the same keys with
   * per-key output-schema-validated values (strict schemas may STRIP extra
   * properties, but never change a key's declared shape).
   */
  parse(raw: Record<string, unknown>, ext: Ext): ValidationResult<State, State> {
    const resolution = this.resolve(intentFromRaw(raw), ext);
    const { errors, data } = validateResolution(resolution);

    if (errors.size > 0) {
      return { success: false, errors: Object.fromEntries(errors), notes: resolution.notes };
    }
    return {
      success: true,
      data: data as State,
      state: resolution.state,
      notes: resolution.notes,
      computedKeys: resolution.keys.filter((key) => resolution.records.get(key)!.isComputed),
    };
  }

  /** Best-effort parse for cost estimation: returns valid fields plus the errors. */
  parsePartial(
    raw: Record<string, unknown>,
    ext: Ext
  ): { data: Partial<State>; errors: Record<string, FieldError>; state: State } {
    const resolution = this.resolve(intentFromRaw(raw), ext);
    const { errors, data } = validateResolution(resolution);

    const partial: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!errors.has(key)) partial[key] = value;
    }
    return { data: partial as Partial<State>, errors: Object.fromEntries(errors), state: resolution.state };
  }

  createStore(...args: CreateStoreArgs<Ext>): FormStore<State, Ext, Codecs> {
    const options = (args[0] ?? {}) as StoreOptions<Ext>;
    return new FormStore(this.config.resolve, composeReconcilers(this.config.reconcile), options, this.defs);
  }
}

/**
 * `defineForm({ resolve, ... })`. External context is annotated on the
 * resolver's own parameter — `resolve: (f, ext: MyExt) => ...` — and `Ext` is
 * inferred from it; omit the parameter and `Ext` is `void`.
 *
 * `defineForm<Ext>()({ ... })` (curried) also works, for stating `Ext` as an
 * explicit type argument. It cannot be one call — `defineForm<Ext>({ ... })`
 * would forfeit `State` inference, because TypeScript type arguments are
 * all-or-nothing: supply one and the rest fall to their defaults instead of
 * being inferred.
 *
 * @typeParam Ext - The external-context type every resolver pass receives
 *   (limits, permissions, catalogs). Serializable values only — it is
 *   provided to `createStore`, replaced whole via `setExt`, and passed to
 *   server-side `parse`.
 * @typeParam State - The form's state union: NEVER annotated. It is inferred
 *   from the resolver's return type — a `switch` returning different shapes
 *   per branch IS the discriminated union, and annotating it would forfeit
 *   that inference.
 */
/** `options` (and `ext` inside it) is optional when the form has no external context. */
export type CreateStoreArgs<Ext> = [void] extends [Ext]
  ? [options?: Omit<StoreOptions<Ext>, 'ext'> & { ext?: Ext }]
  : [options: StoreOptions<Ext>];

/**
 * A graph (or hub) needs none of this — `createStore`/`parse` live on the
 * definition itself. `defineForm` is for forms whose resolver is HAND-WRITTEN
 * (a custom dispatch the hub combinators can't express) or that list
 * reconcile entries beyond what any one graph carries.
 */
export function defineForm<State, Ext = void, Codecs extends DefsInput = CodecRegistry>(
  config: FormConfig<Ext, State, Codecs>
): FormDefinition<State, Ext, NormalizeDefs<Codecs>>;
export function defineForm<Ext = void>(): <State, Codecs extends DefsInput = CodecRegistry>(
  config: FormConfig<Ext, State, Codecs>
) => FormDefinition<State, Ext, NormalizeDefs<Codecs>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineForm(config?: FormConfig<any, any, DefsInput>): any {
  const build = (c: FormConfig<unknown, unknown, DefsInput>) => new FormDefinition(c);
  return config === undefined ? build : build(config);
}

export type InferState<F> =
  F extends FormDefinition<infer State, infer _Ext, infer _Codecs> ? State : never;
export type InferExt<F> =
  F extends FormDefinition<infer _State, infer Ext, infer _Codecs> ? Ext : never;
/** The codec registry a form (or its store) was defined with. */
export type InferDefs<F> =
  F extends FormDefinition<infer _State, infer _Ext, infer Codecs>
    ? Codecs
    : F extends FormStore<infer _State, infer _Ext, infer Codecs>
      ? Codecs
      : never;

/** Value type for a key across every branch that declares it. */
export type InferFieldValue<State, K extends string> = State extends Record<K, infer V>
  ? V
  : never;
