import type { Fields, FieldOptions } from './resolve.js';
import { compileRules, type RuleMap } from './rules.js';
import type { PatchReconciler } from './store.js';
import type { Codec } from './types.js';

/**
 * The library's base factory for defining a field.
 *
 * A field definition has a fixed anatomy — a key, a codec, per-pass options,
 * and optionally the patch rules that must travel with it — and this factory is
 * where that anatomy lives, so every field in an app has the same shape instead
 * of each complex one hand-rolling its own.
 *
 * Two-stage: `defineFieldKit(spec)` states the anatomy once, the returned
 * factory binds app config (catalogs, version tables) and yields a KIT the
 * resolver and the form's rule list consume:
 *
 *   const createCheckpointKit = defineFieldKit<Config, Args, ...>({
 *     key: 'model',
 *     codec: CHECKPOINT,
 *     options: (config, args) => ({ default, project, noteOnProject, meta }),
 *     reconciler: (config) => rule,
 *   });
 *   const checkpoint = createCheckpointKit({ catalog, workflowVersions });
 *   // resolver:   checkpoint.field(f, { ctx })
 *   // form rules: reconcile: [checkpoint.reconciler]
 *
 * What the factory enforces, rather than documents:
 * - the codec resolves ONCE, at kit creation — a config-parameterised codec
 *   cannot be rebuilt per pass, so the churn rule holds structurally
 * - the field key is declared, not buried in a helper body
 * - `reconciler` is always present (identity when the spec has none), so rule
 *   arrays compose uniformly across kits
 *
 * @typeParam Config - What the APP binds once per kit instance: catalogs,
 *   version tables, injected compatibility functions. Every spec slot receives
 *   it; this is how a kit stays library-generic while the app stays concrete.
 * @typeParam Args - What the RESOLVER passes on every pass: ctx values it just
 *   computed (workflow, ecosystem) and per-pass toggles (modelLocked, gate
 *   ids). Use `void` when nothing is dynamic — callers then pass `undefined`.
 * @typeParam T - The field's STATE value type; must match the codec's value
 *   type, and is what `kit.field(...)` returns into the resolver.
 * @typeParam M - The field's meta shape (dynamic UI props for controls).
 *   Defaults to `undefined` for fields whose controls need nothing computed.
 * @typeParam State - The state shape the kit's reconciler reads. Keep it
 *   MINIMAL (only the keys the rules touch, all optional) so the reconciler
 *   stays assignable to any form whose state carries those keys.
 * @typeParam Ext - External-context type the reconciler receives; leave the
 *   `unknown` default when the rules never read ext.
 */
export interface FieldKitSpec<Config, Args, T, M, State, Ext> {
  key: string;
  /** A codec, or a config-parameterised one — resolved once per kit. */
  codec: Codec<T, M> | ((config: Config) => Codec<T, M>);
  /** Per-pass options, computed from bound config + the resolver's args. */
  options?: (config: Config, args: Args) => FieldOptions<T, M>;
  /**
   * Per-pass correction, applied by the generated `field()` via `f.correct`
   * right after the field resolves — the kit-level packaging of the resolver
   * statement. Return undefined to leave the value alone, or the replacement
   * with its reason.
   */
  correct?: (
    value: T,
    config: Config,
    args: Args
  ) => { value: T; reason: string; detail?: Record<string, unknown> } | undefined;
  /**
   * Patch rules that belong to this field — same record shape as
   * `defineRules`: trigger field -> rule (usually just this field's own key).
   */
  rules?: (config: Config) => RuleMap<State, Ext>;
  /** Branch guard applied to this kit's rules. */
  scope?: (config: Config) => ((state: State) => boolean) | undefined;
}

/** A bound kit — the spec's generics minus `Config`, which binding consumed. */
export interface FieldKit<Args, T, M, State, Ext> {
  key: string;
  codec: Codec<T, M>;
  field(f: Fields, args: Args): T;
  reconciler: PatchReconciler<State, Ext>;
}

const identityRule = <State, Ext>(): PatchReconciler<State, Ext> => (patch) => patch;

/**
 * All six generics are declared EXPLICITLY at the definition site (inference
 * has nothing to infer them from — the spec's slots consume rather than
 * produce them). See {@link FieldKitSpec} for what each one means.
 */
export function defineFieldKit<Config, Args, T, M = undefined, State = unknown, Ext = unknown>(
  spec: FieldKitSpec<Config, Args, T, M, State, Ext>
): (config: Config) => FieldKit<Args, T, M, State, Ext> {
  return (config) => {
    const codec = typeof spec.codec === 'function' ? spec.codec(config) : spec.codec;
    return {
      key: spec.key,
      codec,
      field: (f, args) => {
        const value = f.field(spec.key, codec, spec.options?.(config, args));
        const correction = spec.correct?.(value, config, args);
        return correction
          ? f.correct(spec.key, correction.value, correction.reason, correction.detail)
          : value;
      },
      reconciler: spec.rules
        ? compileRules(spec.rules(config), spec.scope?.(config))
        : identityRule<State, Ext>(),
    };
  };
}
