import type { PatchReconciler } from './store.js';

/**
 * Rules are PLAIN MAPS keyed by the trigger field, attached with a graph's
 * (or hub's) `.effect({...})` — or listed directly in a form's `reconcile`
 * array. A rule fires when its key is in the patch, receives the patch VALUE,
 * and returns the keys to ADD to the patch (or nothing). Rules that need app
 * config are ordinary closures: `(cfg) => ({ model: (v, c) => ... })`.
 * Scoping comes from structure — a hub auto-scopes its members' effects — or
 * from an early return inside the rule.
 */

/**
 * @typeParam State - The state shape a rule reads for its decisions. Declare
 *   only the keys the rule touches, optional — a narrow State keeps the rule
 *   assignable to any form whose state carries those keys.
 * @typeParam Ext - External-context type; `unknown` when rules never read it.
 */
export interface RuleCtx<State, Ext = unknown> {
  /** The accumulated patch (earlier rules' corrections included). */
  patch: Readonly<Record<string, unknown>>;
  /** The pre-patch state. */
  state: State;
  /**
   * The EFFECTIVE values: state with the accumulated patch overlaid — what
   * things look like if this patch lands. The one to read when a decision
   * needs several fields together (workflow AND resolution), since any of
   * them may be in this very patch. Patched keys are raw (pre-codec), so
   * trust them the way you trust `value`.
   */
  next: State;
  ext: Ext;
}

/**
 * One rule: fires when its record key is in the patch. `value` is the patch
 * value at that key — the patch itself is untyped, so the parameter annotation
 * is the author's claim about what the key holds. Return the keys to add to
 * the patch, or nothing.
 */
export type Rule<State, Ext = unknown, V = unknown> = (
  value: V,
  ctx: RuleCtx<State, Ext>
) => Record<string, unknown> | undefined | void;

/** Trigger field -> rule. Insertion order is evaluation order. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RuleMap<State, Ext = unknown> = Record<string, Rule<State, Ext, any>>;

/**
 * The general form: ONE callback for a decision that spans keys. Runs on
 * every patch (no trigger key), checks `ctx.patch` itself, returns keys to
 * add. Prefer the keyed map when a single field triggers the reaction.
 */
export type EffectFn<State, Ext = unknown> = (
  ctx: RuleCtx<State, Ext>
) => Record<string, unknown> | undefined | void;

/** Compiles the callback form into one reconciler. */
export function compileEffect<State, Ext>(fn: EffectFn<State, Ext>): PatchReconciler<State, Ext> {
  return (patch, state, ext) => {
    const additions = fn({ patch, state, next: { ...state, ...patch } as State, ext });
    return additions ? { ...patch, ...additions } : patch;
  };
}


/** A compiled rule unit — what `graph.effects` holds and `reconcile:` accepts. */
export interface RuleUnit<State = unknown, Ext = unknown> {
  reconciler: PatchReconciler<State, Ext>;
}

/** Compiles a rule map (plus optional guard) into one reconciler. */
export function compileRules<State, Ext>(
  map: RuleMap<State, Ext>,
  guard?: (state: State) => boolean
): PatchReconciler<State, Ext> {
  const entries = Object.entries(map);
  return (patch, state, ext) => {
    if (guard && !guard(state)) return patch;
    let current = patch;
    for (const [key, rule] of entries) {
      if (!(key in current)) continue;
      const next = { ...state, ...current } as State;
      const additions = rule(current[key], { patch: current, state, next, ext });
      if (additions) current = { ...current, ...additions };
    }
    return current;
  };
}
