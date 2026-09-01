import type { Codec, FieldError, SchemaLike, ValidationResult } from './types.js';
import {
  FormDefinition,
  type DefsInput,
  type CreateStoreArgs,
  type NormalizeDefs,
} from './form.js';
import type { FormStore } from './store.js';
import type { CodecRegistry } from './codec.js';
import type { Fields, FieldOptions } from './resolve.js';
import {
  compileEffect,
  compileRules,
  type EffectFn,
  type RuleCtx,
  type RuleMap,
  type RuleUnit,
} from './rules.js';
import type { Scope } from './scope.js';

/**
 * PROTOTYPE E — the field as ONE FUNCTION returning its whole definition.
 *
 * There are no channels: no meta patch, no constrain mechanism, no refine
 * hook, no codec-vs-options split. A field is `(ctx, ext) => definition`,
 * where the definition carries everything — schemas (full zod, inline,
 * conditional), default, meta, scope, correction policy — or `null` when the
 * field does not exist this pass.
 *
 *   const g = defineGraph<Ext>()
 *     .field('steps', (ctx) => ctx.distilled ? null : slider({
 *       min: 10, max: 50, default: 30,
 *       presets: ctx.draft ? DRAFT_PRESETS : PRESETS,
 *     }))
 *     .field('prompt', (ctx) => ({
 *       input: z.string().optional(),
 *       output: z.string().refine((v) => !ctx.required || v.trim().length > 0),
 *       default: '',
 *     }));
 *
 * Performance model: the definition function runs every pass (cheap object
 * construction). Schema construction is what costs (~25–35µs per codec,
 * measured) — the def helpers (slider/enumOf/textOf) cache their schemas
 * automatically, keyed on the exact values the schemas are built from, so
 * there is nothing to declare and staleness is impossible. Raw inline zod
 * rebuilds per pass; wrap a hot raw definition in `defFamily` if a profile
 * ever says so.
 */
export interface FieldDef<T, M = undefined, O extends SchemaLike<T> = SchemaLike<T>> {
  output: O;
  /**
   * Deliberately untyped against T: the input pass is LENIENT — it may accept
   * fragments (an id where the state holds a full record) that only become T
   * after coercion or later enrichment. `output` is the contract; typing input
   * against T forced a cast at every lenient definition.
   */
  input?: SchemaLike<unknown>;
  default?: T | (() => T);
  coerce?: (raw: unknown) => T;
  toOutput?: (value: T) => unknown;
  meta?: M | ((value: T) => M);
  scope?: Scope;
  correct?: (value: T) => { value: T; reason: string; detail?: Record<string, unknown> } | undefined;
  /**
   * Wire disposition: a string emits this key's value under that name in
   * parsed data; false keeps it out of parsed data entirely (it still
   * resolves, guards, and holds intent). Use the pair for a SELECTION the
   * form keeps and a DERIVED value the wire carries — never overwrite one
   * key with two facts.
   */
  emit?: false | string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = FieldDef<any, any>;
export type AnyFieldDef = FieldDef<any, any>;
type DefValue<D> = D extends FieldDef<infer T, infer _M> ? T : never;
/**
 * What a definition (or computed) function receives: the prior fields spread
 * at top level — destructure exactly what you read — with the external
 * context under the one reserved key, `_ext`. `_ext` cannot be a field name.
 */
type BagKeys<C> = C extends unknown ? keyof C : never;

/**
 * The read surface a field/computed callback gets when Ctx is a UNION (fields
 * declared after a mounted branch): every key of every arm, typed
 * `T | undefined` where the key is missing from some arm — so a hub field can
 * destructure a family's output without casting. Only the callback's bag is
 * loosened; the graph's Ctx (state types, DataOf) keeps the real union. The
 * cost is tag-correlation inside the bag (narrowing on a branch tag no longer
 * narrows sibling keys) — state types retain it.
 */
type LooseCtx<C> = [BagKeys<C>] extends [never]
  ? C
  : { [K in BagKeys<C>]: C extends unknown ? (K extends keyof C ? C[K] : undefined) : never };

export type DefBag<Ctx, Ext> = LooseCtx<Ctx> & { _ext: Ext };

type DefArg<Ctx, Ext> = AnyDef | ((c: DefBag<Ctx, Ext>) => AnyDef | null);

/**
 * Rules typed FROM the graph: triggers are its own keys, each rule's value
 * parameter is that field's type (as found in a raw patch, so possibly
 * undefined), and state is the graph's ctx with every key optional (rules run
 * against whatever branch is live).
 */
export type GraphRules<Ctx, Ext> = {
  [K in keyof Ctx & string]?: (
    value: Ctx[K] | undefined,
    ctx: RuleCtx<Partial<Ctx>, Ext>
  ) => Record<string, unknown> | undefined | void;
};

interface Entry {
  kind: 'field' | 'computed' | 'graph';
  key: string;
  def?: DefArg<unknown, unknown>;
  calc?: (c: Record<string, unknown>) => unknown;
  emitOpt?: false | string;
  graph?: GraphLike<object, unknown>;
}

type ExtArg<Ext> = [void] extends [Ext] ? [ext?: Ext] : [ext: Ext];

/** graph key -> wire disposition, accumulated only for keys that declare one. */
type WireMap = Record<string, false | string>;

type UtoI<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void
  ? I
  : never;

/**
 * The WIRE shape of parsed data, derived from the state type and the emit
 * dispositions: emitting keys leave under their wire names carrying their own
 * types, emit:false keys leave entirely. This is what makes `parse().data`
 * tell the truth when a selection stays in-graph and a derived value rides
 * the wire under its old name.
 */
export type DataOf<Ctx, W extends WireMap> = [keyof W] extends [never]
  ? Ctx // no emits: data IS the state type, identically — not a mapped copy
  : Ctx extends unknown // distribute over state unions (hub branches) — Omit on a union intersects keys
    ? // a wire name also evicts the state key it shadows — a field whose name a
      // computed emits needs no emit:false of its own
      Omit<Ctx, keyof W | Extract<W[keyof W], string>> &
        UtoI<
          {
            [K in keyof W]: W[K] extends string
              ? Record<W[K], K extends keyof Ctx ? Ctx[K] : never>
              : never;
          }[keyof W]
        >
    : never;

type EmitOf<D> = D extends { emit: infer E extends false | string } ? E : never;

/** The runtime entry points every definition carries — a graph IS the form. */
interface Mountable<Ctx, Ext, Defs, W extends WireMap = Record<never, never>> {
  /**
   * PHANTOM — never set at runtime. Carries the wire map in the type so
   * composition sites (`.use`, hub members) can INFER it; without a member
   * mentioning W, inference has no site and falls back to the constraint,
   * whose `keyof` is `string` — which would Omit every key from DataOf.
   */
  readonly __wire?: W;
  /** A live client store over this definition. */
  createStore(
    ...args: CreateStoreArgs<Ext>
  ): FormStore<Ctx, Ext, NormalizeDefs<Defs>, DataOf<Ctx, W>>;
  /** The server entry point: boundary schemas -> resolve -> output validation. */
  parse(raw: Record<string, unknown>, ...ext: ExtArg<Ext>): ValidationResult<DataOf<Ctx, W>, Ctx>;
  /** Best-effort parse: valid fields plus the errors, no throw. */
  parsePartial(
    raw: Record<string, unknown>,
    ...ext: ExtArg<Ext>
  ): { data: Partial<DataOf<Ctx, W>>; errors: Record<string, FieldError>; state: Ctx };
}

export interface Graph<
  Ctx extends object,
  Ext,
  Defs extends Record<string, AnyDef> = Record<never, never>,
  W extends WireMap = Record<never, never>,
> extends Mountable<Ctx, Ext, Defs, W> {
  /**
   * The registry for bindings and forms. TYPE-complete (every field,
   * function-defined ones included, so `typedFields`/`<Field>` know every
   * key); at RUNTIME it holds the static defs only — resolution always passes
   * the freshly computed def, so nothing reads the runtime entries for
   * function fields.
   */
  readonly defs: Defs;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly effects: readonly RuleUnit<any, Ext>[];
  resolve(f: Fields, ...ext: ExtArg<Ext>): Ctx;

  field<K extends Exclude<string, '_ext'>, const D extends AnyDef | null>(
    key: K & (K extends '_ext' ? never : K),
    def: (c: DefBag<Ctx, Ext>) => D
  ): Graph<
    Ctx &
      ([Extract<D, null>] extends [never]
        ? Record<K, DefValue<D>>
        : Partial<Record<K, DefValue<NonNullable<D>>>>),
    Ext,
    Defs & Record<K, NonNullable<D>>,
    W & ([EmitOf<NonNullable<D>>] extends [never] ? Record<never, never> : Record<K, EmitOf<NonNullable<D>>>)
  >;
  field<K extends string, const D extends AnyDef>(
    key: K,
    def: D
  ): Graph<
    Ctx & Record<K, DefValue<D>>,
    Ext,
    Defs & Record<K, D>,
    W & ([EmitOf<D>] extends [never] ? Record<never, never> : Record<K, EmitOf<D>>)
  >;

  computed<K extends string, T, const E extends false | string = never>(
    key: K & (K extends '_ext' ? never : K),
    calc: (c: DefBag<Ctx, Ext>) => T,
    opts?: { emit?: E }
  ): Graph<
    Ctx & Record<K, T>,
    Ext,
    Defs,
    W & ([E] extends [never] ? Record<never, never> : Record<K, E>)
  >;

  /**
   * Attach rules as a PLAIN MAP keyed by the trigger field: a rule fires when
   * its key is in a patch, reads the pre-patch state, and returns keys to add
   * to the patch. Everything is typed from the graph — no generics, no
   * wrapper. A pre-built unit carrying a `reconciler` (a field kit's rules,
   * another graph's effects) is also accepted.
   */
  effect(rules: GraphRules<Ctx, Ext>): Graph<Ctx, Ext, Defs, W>;
  /**
   * The callback form, for a decision that SPANS keys: runs on every patch,
   * checks `ctx.patch` itself, returns keys to add.
   */
  effect(fn: EffectFn<Partial<Ctx>, Ext>): Graph<Ctx, Ext, Defs, W>;
  /** Rules triggered by keys this graph doesn't own — annotate params yourself. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effect(rules: RuleMap<any, Ext>): Graph<Ctx, Ext, Defs>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effect(unit: RuleUnit<any, Ext>): Graph<Ctx, Ext, Defs, W>;

  /**
   * Mount another graph (or hub) at this point in the chain. The child is an
   * ordinary `defineGraph` whose Ext declares what it NEEDS from upstream —
   * at resolve time it receives the parent's ext with the ctx-so-far merged
   * over it, so a need is satisfied by a prior field or by the parent's own
   * ext. Its fields, registry, and effects join the chain.
   *
   * The function form is plain application — `use(fn)` IS `fn(this)` — for
   * transforms a standalone graph can't express (e.g. key prefixing).
   */
  use<C2 extends object, X2, D2 extends Record<string, AnyDef>, W2 extends WireMap>(
    child: GraphSource<C2, X2, D2, W2> &
      NeedsCheck<Ctx & ([Ext] extends [object] ? Ext : unknown), X2>
  ): Graph<Ctx & C2, Ext, Defs & D2, W & W2>;
  use<G>(fn: (g: this) => G): G;
}

interface MountSource {
  defs: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effects: readonly RuleUnit<any, any>[];
  resolve(f: Fields, ext?: unknown): unknown;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const forms = new WeakMap<object, FormDefinition<any, any>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const formOf = (g: MountSource): FormDefinition<any, any> => {
  let f = forms.get(g);
  if (!f) {
    f = new FormDefinition({
      defs: g.defs as DefsInput,
      reconcile: [...g.effects],
      resolve: (fields, ext) => g.resolve(fields, ext),
    });
    forms.set(g, f);
  }
  return f;
};

const runtime = {
  createStore(this: MountSource, ...args: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (formOf(this) as any).createStore(...args);
  },
  parse(this: MountSource, raw: Record<string, unknown>, ext?: unknown) {
    return formOf(this).parse(raw, ext);
  },
  parsePartial(this: MountSource, raw: Record<string, unknown>, ext?: unknown) {
    return formOf(this).parsePartial(raw, ext);
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function make<Ctx extends object, Ext>(entries: Entry[], effects: RuleUnit<any, Ext>[]): Graph<Ctx, Ext, Record<string, AnyDef>> {
  const defs: Record<string, unknown> = {};
  for (const e of entries) {
    if (e.kind === 'field' && typeof e.def !== 'function') defs[e.key] = e.def;
    if (e.kind === 'graph') Object.assign(defs, e.graph!.defs);
  }

  return {
    defs: defs as Record<string, AnyDef>,
    effects,

    resolve(f: Fields, ext: Ext): Ctx {
      const ctx: Record<string, unknown> = {};
      // the bag mirrors ctx plus the one reserved key; ctx itself stays clean
      // (it is returned as state)
      const bag: Record<string, unknown> = { _ext: ext };
      for (const e of entries) {
        if (e.kind === 'graph') {
          const mounted = e.graph!.resolve(f, { ...(ext as object), ...ctx });
          Object.assign(ctx, mounted);
          Object.assign(bag, mounted);
          continue;
        }
        if (e.kind === 'computed') {
          bag[e.key] = ctx[e.key] = f.computed(e.key, e.calc!(bag), { emit: e.emitOpt });
          continue;
        }
        const def = typeof e.def === 'function' ? e.def(bag as never) : e.def;
        if (def == null) continue;
        const codec = {
          input: def.input,
          output: def.output,
          default: def.default,
          coerce: def.coerce,
          toOutput: def.toOutput,
        } as Codec<unknown, unknown> & { output: SchemaLike<unknown> };
        const opts: FieldOptions<unknown, unknown> = {};
        if (def.scope !== undefined) opts.scope = def.scope;
        if (def.meta !== undefined) opts.meta = def.meta as FieldOptions<unknown, unknown>['meta'];
        if (def.correct !== undefined) opts.correct = def.correct as FieldOptions<unknown, unknown>['correct'];
        if (def.emit !== undefined) opts.emit = def.emit;
        bag[e.key] = ctx[e.key] = f.field(e.key, codec, opts);
      }
      return ctx as Ctx;
    },

    field(key: string, def: unknown) {
      if (key === '_ext') throw new Error('"_ext" is reserved: it carries the external context in definition functions.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return make([...entries, { kind: 'field', key, def: def as Entry['def'] }], effects) as any;
    },

    computed(key: string, calc: unknown, opts?: { emit?: false | string }) {
      if (key === '_ext') throw new Error('"_ext" is reserved: it carries the external context in definition functions.');
      return make(
        [...entries, { kind: 'computed', key, calc: calc as Entry['calc'], emitOpt: opts?.emit }],
        effects
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ) as any;
    },

    effect(arg: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return make<Ctx, Ext>(entries, [...effects, toUnit(arg) as RuleUnit<any, Ext>]) as any;
    },

    ...runtime,

    use(arg: unknown) {
      if (typeof arg === 'function') return (arg as (g: unknown) => unknown)(this);
      const child = arg as GraphLike<object, unknown>;
      const merged = [...effects];
      for (const e of child.effects) if (!merged.includes(e)) merged.push(e);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return make([...entries, { kind: 'graph', key: '', graph: child }], merged) as any;
    },
  } as Graph<Ctx, Ext, Record<string, AnyDef>>;
}

export function defineGraph<Ext = void>(): Graph<Record<never, never>, Ext> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return make([], []) as any;
}

type RequiredNeeds<T> = { [K in keyof T]-?: undefined extends T[K] ? never : K }[keyof T];
type BadNeedKeys<C, Needs> = {
  [K in keyof Needs & keyof C]-?: C[K] extends Needs[K] ? never : K;
}[keyof Needs & keyof C];
/**
 * Whether a mount point satisfies a child graph's Ext, checked PER KEY rather
 * than via `extends`: an all-optional Ext is a WEAK TYPE, so `extends` would
 * reject any parent sharing no keys with it — the exact case optional needs
 * exist for (read the key, get undefined). Resolves to `unknown` (a no-op on
 * the parameter) when compatible, and to an impossible branded object naming
 * the offending keys when not.
 */
type NeedsCheck<C, Needs> = [Needs] extends [object]
  ? [Exclude<RequiredNeeds<Needs>, keyof C>] extends [never]
    ? [BadNeedKeys<C, Needs>] extends [never]
      ? unknown
      : { 'mounted graph needs incompatible ctx at key': BadNeedKeys<C, Needs> }
    : { 'mounted graph needs missing from ctx': Exclude<RequiredNeeds<Needs>, keyof C> }
  : unknown;

/** What a graph exposes to composition — a hub produces the same shape. */
/**
 * What composition sites (hub members, `.use` children) require — the data
 * surface only, so richer shapes (full graphs with runtime methods) always
 * qualify without variance friction.
 */
export interface GraphSource<
  Ctx,
  Ext,
  Defs extends Record<string, AnyFieldDef> = Record<string, AnyFieldDef>,
  W extends WireMap = WireMap,
> {
  /** Phantom wire map — see Mountable.__wire. */
  readonly __wire?: W;
  readonly defs: Defs;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly effects: readonly RuleUnit<any, any>[];
  resolve(f: Fields, ...ext: ExtArg<Ext>): Ctx;
}

export interface GraphLike<
  Ctx,
  Ext,
  Defs extends Record<string, AnyFieldDef> = Record<string, AnyFieldDef>,
  W extends WireMap = Record<never, never>,
> extends Mountable<Ctx, Ext, Defs, W> {
  readonly defs: Defs;
  // Ext-agnostic on purpose: a hub is usually mounted by a form whose Ext
  // differs (the resolver adapts ext before delegating), and the form still
  // needs to spread the hub's effects into its own reconcile list.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly effects: readonly RuleUnit<any, any>[];
  resolve(f: Fields, ...ext: ExtArg<Ext>): Ctx;
  /**
   * Attach rules — same chain section as a graph's `.effect`. Hub-level rules
   * usually trigger on fields owned elsewhere, so the map is loosely typed:
   * annotate rule params yourself. NOT auto-scoped (the hub can't know when
   * the mounting form considers it active) — guard inside the rule.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effect(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rules: RuleMap<any, any> | EffectFn<any, any> | RuleUnit<any, any>
  ): GraphLike<Ctx, Ext, Defs, W>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CtxOf<G> = G extends GraphSource<infer C, any, any, any> ? C : never;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I
) => void
  ? I
  : never;

/** DefsOf over a UNION of member graphs (the record-less branch form). */
type DefsOfUnion<G> =
  UnionToIntersection<G extends { defs: infer D } ? D : never> extends infer Merged extends
    Record<string, AnyFieldDef>
    ? Merged
    : Record<string, AnyFieldDef>;

/** WOf over a UNION of member graphs (the record-less branch form). */
type WOfUnion<G> =
  UtoI<
    G extends { __wire?: infer MW } ? (NonNullable<MW> extends WireMap ? NonNullable<MW> : never) : never
  > extends infer Merged extends WireMap
    ? Merged
    : Record<never, never>;

/** Every member's registry merged — what typedFields/<Field> read off a hub. */
type DefsOf<Members> =
  UnionToIntersection<
    { [M in keyof Members]: Members[M] extends { defs: infer D } ? D : never }[keyof Members]
  > extends infer Merged extends Record<string, AnyFieldDef>
    ? Merged
    : Record<string, AnyFieldDef>;

/**
 * Merge member registries, and AUTO-SCOPE member effects: a rule attached to
 * a member graph fires only while that member is the picked branch — the hub
 * knows the dispatch, so nobody hand-writes the guard. A unit shared through
 * a common prefix merges once and fires when ANY of its members is active.
 */
/** Every member's wire map merged — a hub's parse data reflects member emits. */
type WOf<Members> =
  UtoI<
    {
      [M in keyof Members]: Members[M] extends { __wire?: infer MW }
        ? NonNullable<MW> extends WireMap
          ? NonNullable<MW>
          : never
        : never;
    }[keyof Members]
  > extends infer Merged extends WireMap
    ? Merged
    : Record<never, never>;

const mergeMembers = <Ext>(
  members: Record<string, GraphSource<object, Ext>>,
  /** null = no auto-scoping: member effects pass through unwrapped. */
  activeMember:
    | ((
        patch: Readonly<Record<string, unknown>>,
        state: Record<string, unknown>,
        ext: Ext
      ) => string | undefined)
    | null
) => {
  const defs: Record<string, AnyFieldDef> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const owners = new Map<RuleUnit<any, any>, Set<string>>();
  for (const [name, g] of Object.entries(members)) {
    Object.assign(defs, g.defs);
    for (const e of g.effects) {
      let set = owners.get(e);
      if (!set) owners.set(e, (set = new Set()));
      set.add(name);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effects: RuleUnit<any, any>[] =
    activeMember === null
      ? [...owners.keys()]
      : [...owners.entries()].map(([unit, names]) => ({
          reconciler: (patch, state, ext) => {
            const active = activeMember(patch, state as Record<string, unknown>, ext as Ext);
            return active !== undefined && names.has(active)
              ? unit.reconciler(patch, state, ext)
              : patch;
          },
        }));
  return { defs, effects };
};

/** A rule map, a callback, or a pre-built unit -> a unit. The one normalization point. */
const toUnit = (arg: unknown): RuleUnit<unknown, unknown> =>
  typeof arg === 'function'
    ? { reconciler: compileEffect(arg as EffectFn<unknown, unknown>) }
    : arg !== null && typeof arg === 'object' && !('reconciler' in arg)
      ? { reconciler: compileRules(arg as Parameters<typeof compileRules>[0]) }
      : (arg as RuleUnit<unknown, unknown>);

const chainable = <H extends { readonly effects: readonly unknown[] }>(hub: H): H => ({
  ...hub,
  ...runtime,
  effect(arg: unknown) {
    return chainable({ ...hub, effects: [...hub.effects, toUnit(arg)] });
  },
});

/**
 * A HUB that dispatches on a value derived from the external context — the
 * shape of a version-family form (the wan graph picks its version subgraph
 * from the ecosystem). The member graphs' registries and effects merge and
 * ride the hub, so a form mounting it inherits everything; each member's own
 * literal computed key is what discriminates the state union.
 *
 *   export const wan = branch((ext: WanExt) => versionOf(ext.ecosystem), {
 *     'v2.1': v21, 'v2.2': v22, ...
 *   }).effect(wanCoupling);
 */
export function branch<Ext, const M extends GraphSource<object, Ext>>(
  pick: (ext: Ext) => M
): GraphLike<CtxOf<M>, Ext, DefsOfUnion<M>, WOfUnion<M>>;
export function branch<Ext, const Members extends Record<string, GraphSource<object, Ext>>>(
  pick: (ext: Ext) => keyof Members | Members[keyof Members],
  members: Members
): GraphLike<CtxOf<Members[keyof Members]>, Ext, DefsOf<Members>, WOf<Members>>;
/**
 * Tagged: name a key and the picked MEMBER KEY lands in state under it, as a
 * computed — the derived counterpart of `branchOn`'s field. The state union
 * discriminates on it (`Extract<State, { wanVersion: 'v2.5' }>`), so members
 * never re-declare which member they are.
 */
export function branch<
  K extends string,
  Ext,
  const Members extends Record<string, GraphSource<object, Ext>>,
>(
  key: K,
  pick: (ext: Ext) => keyof Members | Members[keyof Members],
  members: Members
): GraphLike<
  { [M in keyof Members]: Record<K, M> & CtxOf<Members[M]> }[keyof Members],
  Ext,
  DefsOf<Members>,
  WOf<Members>
>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function branch(...args: any[]): any {
  const [key, pick, members] =
    typeof args[0] === 'string' ? args : [undefined, args[0], args[1]];
  if (key === undefined && members === undefined) {
    // Record-less: the pick returns member graphs directly and there is no
    // manifest. Member rules forward lazily from the members a store has
    // actually resolved (a never-activated member's rules never matter); the
    // runtime defs registry stays empty, which graph-model members never
    // read — resolution always passes each field's freshly computed def.
    const seen = new Set<{ effects: readonly RuleUnit<unknown, unknown>[] }>();
    return chainable({
      defs: {},
      effects: [
        {
          reconciler: (
            patch: Readonly<Record<string, unknown>>,
            state: unknown,
            ext: unknown
          ) => {
            let p = patch;
            for (const m of seen) for (const e of m.effects) p = e.reconciler(p, state, ext);
            return p;
          },
        },
      ] as RuleUnit<unknown, unknown>[],
      resolve(f: Fields, ext: unknown) {
        const member = pick(ext) as { resolve?: (f: Fields, ext: unknown) => unknown } | undefined;
        if (!member || typeof member.resolve !== 'function')
          throw new Error('branch: the pick must return a member graph');
        seen.add(member as never);
        return member.resolve!(f, ext);
      },
    });
  }
  const keyByMember = new Map<object, string>(
    Object.entries(members as Record<string, object>).map(([k, m]) => [m, k])
  );
  return chainable({
    ...mergeMembers(
      members,
      key !== undefined
        ? // Tagged: the stamped key in state is the truth, read EFFECTIVELY
          // (patch over state). pick(ext) would lie here — a mounting form's
          // ext is not the hub's ext (the resolver adapts it), and reconcile
          // only ever sees the form's.
          (patch: Readonly<Record<string, unknown>>, state: Record<string, unknown>) =>
            ({ ...state, ...patch })[key] as string | undefined
        : // Untagged: no state-resident discriminator exists, and pick(ext)
          // lies under any mounting form — so no auto-scoping. Rules on
          // untagged members must self-guard; tag the hub to get scoping.
          null
    ),
    resolve(f: Fields, ext: unknown) {
      // the pick may return a member KEY or the member GRAPH itself — the
      // record stays the manifest either way (defs merge, state union, and
      // the tag stamped below all come from it)
      const pickedRaw = pick(ext) as string | object;
      const picked =
        typeof pickedRaw === 'string' ? pickedRaw : keyByMember.get(pickedRaw);
      const member = picked !== undefined ? members[picked] : undefined;
      if (!member || picked === undefined)
        throw new Error(
          `branch${key ? ` "${key}"` : ''}: ${
            typeof pickedRaw === 'string'
              ? `no member graph for "${pickedRaw}"`
              : 'pick returned a graph that is not one of the members'
          }`
        );
      const resolved = member.resolve(f, ext);
      return key === undefined ? resolved : { [key]: f.computed(key, picked), ...resolved };
    },
  });
}

/**
 * A HUB that dispatches on a DISCRIMINATOR FIELD it declares itself — the
 * shape of a destination/workflow picker. The state union is discriminated by
 * that key: each arm is tagged with the narrowed literal, so
 * `Extract<State, { destination: 's3' }>` is the exact member shape.
 *
 *   export const publish = branchOn('destination', DESTINATION, {
 *     s3: s3Graph, email: emailGraph, webhook: webhookGraph,
 *   });
 */
export function branchOn<
  Ext,
  K extends string,
  const Members extends Record<string, GraphSource<object, Ext>>,
  D extends AnyFieldDef = FieldDef<keyof Members & string, unknown>,
>(
  key: K,
  def: D & { output: SchemaLike<keyof Members & string> },
  members: Members
): GraphLike<
  { [M in keyof Members]: Record<K, M> & CtxOf<Members[M]> }[keyof Members],
  Ext,
  DefsOf<Members> & Record<K, D>,
  WOf<Members> & ([EmitOf<D>] extends [never] ? Record<never, never> : Record<K, EmitOf<D>>)
> {
  // active member = the discriminator's value in the pre-patch state
  const merged = mergeMembers(
    members,
    (patch, state) => ({ ...state, ...patch })[key] as string | undefined
  );
  merged.defs[key] = def as AnyFieldDef;
  return chainable({
    ...merged,
    resolve(f: Fields, ext: Ext) {
      const picked = f.field(
        key,
        def as Codec<keyof Members & string, unknown> & { output: SchemaLike<keyof Members & string> }
      );
      const member = members[picked];
      if (!member) throw new Error(`branchOn "${key}": no member graph for "${String(picked)}"`);
      return { [key]: picked, ...member.resolve(f, ext) } as {
        [M in keyof Members]: Record<K, M> & CtxOf<Members[M]>;
      }[keyof Members];
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}
