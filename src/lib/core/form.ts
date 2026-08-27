import { intentFromRaw, type Intent } from './intent.js';
import { resolve, type Resolution, type Resolver } from './resolve.js';
import { FormStore, type PatchReconciler, type StoreOptions } from './store.js';
import type { RuleUnit } from './rules.js';
import { validateResolution } from './validate.js';
import type { CodecRegistry } from './codec.js';
import type { FieldError, ValidationResult } from './types.js';

/**
 * @typeParam Ext - See {@link defineForm}: annotated by the caller.
 * @typeParam State - See {@link defineForm}: inferred from `resolve`'s return.
 * @typeParam Codecs - See {@link defineForm}: inferred from the `codecs` slot.
 */
export interface FormConfig<Ext, State, Codecs extends CodecRegistry = CodecRegistry> {
  resolve: Resolver<Ext, State>;
  /**
   * The form's codec registry: every field key mapped to its codec. This is
   * what lets bindings derive each key's value/meta types FROM THE FORM —
   * `typedFields(store)` and `<Field>` need no separate registry export.
   * Purely additive: forms without it still work, their fields just type as
   * unknown in registry-driven helpers.
   */
  codecs?: Codecs;
  /**
   * Rewrites a patch before it reaches intent — the home for conflicts between
   * two user choices (v1's mutually-recursive effects). Runs once, before
   * resolution, so there is no loop to detect.
   *
   * THE STANDARD: an array of rule UNITS — field kits and `defineRules`
   * products, each exposing `reconciler` — composed left-to-right with each
   * unit seeing the accumulated patch. Declare hub units before branch units
   * so branch rules see the hub's corrections. Bare functions are accepted for
   * tests, but shipped rules belong in a unit.
   */
  reconcile?: ReconcileEntry<State, Ext> | readonly ReconcileEntry<State, Ext>[];
}

type ReconcileEntry<State, Ext> = PatchReconciler<State, Ext> | RuleUnit<State, Ext>;

const toRule = <State, Ext>(entry: ReconcileEntry<State, Ext>): PatchReconciler<State, Ext> =>
  typeof entry === 'function' ? entry : entry.reconciler;

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
 * @typeParam Codecs - The codec registry from the config's `codecs` slot —
 *   carried here (and onto the store) so bindings can derive per-key
 *   value/meta types from the form itself.
 */
export class FormDefinition<State, Ext, Codecs extends CodecRegistry = CodecRegistry> {
  /** The registry from the config, for runtime lookups (empty if none given). */
  readonly codecs: Codecs;

  constructor(private readonly config: FormConfig<Ext, State, Codecs>) {
    this.codecs = config.codecs ?? ({} as Codecs);
  }

  /**
   * One-shot resolution over KEY-addressed values (raw server input,
   * introspection pins). They run through the pending layer, so scoped fields
   * find them by key — scope buckets are a store concern, invisible here.
   */
  resolve(valuesByKey: Intent, ext: Ext): Resolution<State> {
    return resolve(this.config.resolve, new Map(), ext, new WeakMap(), valuesByKey);
  }

  /**
   * The server entry point, and the same pipeline the client walks: boundary
   * codecs -> resolve -> output validation. Pure — no store, no clone, no
   * shared mutable template.
   *
   * `data` is typed as `State`: the output view holds the same keys with
   * per-key output-schema-validated values (strict schemas may STRIP extra
   * properties — enriched resources — but never change a key's declared
   * shape). Same claim v1 makes typing safeParse data as Ctx.
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

  createStore(options: StoreOptions<Ext>): FormStore<State, Ext, Codecs> {
    return new FormStore(this.config.resolve, composeReconcilers(this.config.reconcile), options);
  }
}

/**
 * `defineForm<Ext>()({ resolve, reconcile })`
 *
 * Two calls so `Ext` is annotated while `State` stays inferred from the
 * resolver's return type — which is where the discriminated union comes from.
 *
 * @typeParam Ext - The external-context type every resolver pass receives
 *   (limits, user, gate rules): ANNOTATED by the caller on the first call.
 *   Serializable values only — it is provided to `createStore`, replaced whole
 *   via `setExt`, and passed to server-side `parse`.
 * @typeParam State - The form's state union: NEVER annotated. It is inferred
 *   from the resolver's return type on the second call — a `switch` returning
 *   different shapes per branch IS the discriminated union, and annotating it
 *   would forfeit that inference.
 */
export function defineForm<Ext = void>() {
  return function <State, Codecs extends CodecRegistry = CodecRegistry>(
    config: FormConfig<Ext, State, Codecs>
  ): FormDefinition<State, Ext, Codecs> {
    return new FormDefinition<State, Ext, Codecs>(config);
  };
}

export type InferState<F> =
  F extends FormDefinition<infer State, infer _Ext, infer _Codecs> ? State : never;
export type InferExt<F> =
  F extends FormDefinition<infer _State, infer Ext, infer _Codecs> ? Ext : never;
/** The codec registry a form (or its store) was defined with. */
export type InferCodecs<F> =
  F extends FormDefinition<infer _State, infer _Ext, infer Codecs>
    ? Codecs
    : F extends FormStore<infer _State, infer _Ext, infer Codecs>
      ? Codecs
      : never;

/** Value type for a key across every branch that declares it. */
export type InferFieldValue<State, K extends string> = State extends Record<K, infer V>
  ? V
  : never;
