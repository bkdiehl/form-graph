import { intentFromRaw, type Intent } from './intent.js';
import { resolve, type Resolution, type Resolver } from './resolve.js';
import { FormStore, type PatchReconciler, type StoreOptions } from './store.js';
import type { RuleUnit } from './rules.js';
import { validateResolution } from './validate.js';
import type { FieldError, ValidationResult } from './types.js';

/**
 * @typeParam Ext - See {@link defineForm}: annotated by the caller.
 * @typeParam State - See {@link defineForm}: inferred from `resolve`'s return.
 */
export interface FormConfig<Ext, State> {
  resolve: Resolver<Ext, State>;
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

export class FormDefinition<State, Ext> {
  constructor(private readonly config: FormConfig<Ext, State>) {}

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

  createStore(options: StoreOptions<Ext>): FormStore<State, Ext> {
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
  return function <State>(config: FormConfig<Ext, State>): FormDefinition<State, Ext> {
    return new FormDefinition<State, Ext>(config);
  };
}

export type InferState<F> = F extends FormDefinition<infer State, infer _Ext> ? State : never;
export type InferExt<F> = F extends FormDefinition<infer _State, infer Ext> ? Ext : never;

/** Value type for a key across every branch that declares it. */
export type InferFieldValue<State, K extends string> = State extends Record<K, infer V>
  ? V
  : never;
