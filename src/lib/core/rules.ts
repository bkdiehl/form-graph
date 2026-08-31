import type { PatchReconciler } from './store.js';

/**
 * THE STANDARD for rules, mirroring `defineFieldKit` for fields. Every rule
 * lives in one of exactly two homes:
 *
 *   1. a field kit's `rules` slot — rules owned by ONE field
 *   2. a `defineRules` unit — rules owned by a module or a relationship
 *      between fields (a mode<->model coupling, a resolution<->variant
 *      mapping)
 *
 * Both expose a single `reconciler`, and a form's `reconcile:` array lists
 * those UNITS — named things with an anatomy — never bare inline functions.
 *
 * Rules are a RECORD keyed by the trigger field — the same key -> definition
 * shape fields use. A rule fires when its key is in the patch, receives the
 * patch VALUE, and returns the keys to ADD to the patch (or nothing):
 *
 *   const createPlanCoupling = defineRules<void, PlanRuleState>({
 *     scope: (state) => state.tier === 'enterprise',
 *     rules: () => ({
 *       plan: (plan, { patch, state }) => { ... },
 *       addon: (addon, { state }) => {
 *         if (addon?.id === premiumId && state.plan !== 'annual') {
 *           return { plan: 'annual' };
 *         }
 *       },
 *     }),
 *   });
 *   const planCoupling = createPlanCoupling();
 *   // form: reconcile: [planCoupling, ...kits]
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
 * @typeParam Config - What the APP binds once per unit (tables, injected
 *   functions), received by the `rules` slot. Use `void` for units with no
 *   config — callers then invoke the factory with no argument.
 * @typeParam State - The state shape the guard and rules read. Same rule as
 *   everywhere: declare only the keys touched, optional, so the unit slots
 *   into any form whose state carries them.
 * @typeParam Ext - External-context type; `unknown` when rules never read it.
 */
export interface RulesSpec<Config, State, Ext> {
  /** Branch guard applied to every rule in the unit. */
  scope?: (state: State) => boolean;
  rules: (config: Config) => RuleMap<State, Ext>;
}

/**
 * A bound rule unit — what `reconcile:` arrays list.
 *
 * @typeParam State / Ext - Carried from the spec; see {@link RulesSpec}.
 */
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

/**
 * Generics are declared EXPLICITLY at the definition site, like
 * `defineFieldKit` — the spec's slots consume them, so inference has nothing
 * to infer from. See {@link RulesSpec} for what each one means.
 */
/**
 * With no Config there is nothing to bind, so the returned factory is ALSO
 * the unit itself — `defineRules({ ... })` drops straight into a form's
 * `reconcile` array (or a graph's `.effect`), no trailing `()`. Config-bound
 * rules still call the factory with their config.
 */
export function defineRules<Config = void, State = { [key: string]: unknown }, Ext = unknown>(
  spec: RulesSpec<Config, State, Ext>
): ((config: Config) => RuleUnit<State, Ext>) & ([Config] extends [void] ? RuleUnit<State, Ext> : unknown) {
  const factory = (config: Config): RuleUnit<State, Ext> => ({
    reconciler: compileRules(spec.rules(config), spec.scope),
  });
  let lazy: RuleUnit<State, Ext> | undefined;
  Object.defineProperty(factory, 'reconciler', {
    get() {
      lazy ??= factory(undefined as Config);
      return lazy.reconciler;
    },
  });
  return factory as ((config: Config) => RuleUnit<State, Ext>) &
    ([Config] extends [void] ? RuleUnit<State, Ext> : unknown);
}
