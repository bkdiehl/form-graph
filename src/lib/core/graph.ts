import type { Codec, SchemaLike } from './types.js';
import type { CodecRegistry } from './codec.js';
import type { Fields, FieldOptions } from './resolve.js';
import type { RuleUnit } from './rules.js';
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
 * rebuilds per pass; wrap a hot raw definition in `codecFamily` if a profile
 * ever says so.
 */
export interface FieldDef<T, M = undefined> {
  output: SchemaLike<T>;
  input?: SchemaLike<T | undefined>;
  default?: T | (() => T);
  coerce?: (raw: unknown) => T;
  toOutput?: (value: T) => unknown;
  meta?: M | ((value: T) => M);
  scope?: Scope;
  correct?: (value: T) => { value: T; reason: string; detail?: Record<string, unknown> } | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDef = FieldDef<any, any>;
export type AnyFieldDef = FieldDef<any, any>;
type DefValue<D> = D extends FieldDef<infer T, infer _M> ? T : never;
type DefArg<Ctx, Ext> = AnyDef | ((ctx: Ctx, ext: Ext) => AnyDef | null);

interface Entry {
  kind: 'field' | 'computed' | 'graph';
  key: string;
  def?: DefArg<unknown, unknown>;
  calc?: (ctx: unknown, ext: unknown) => unknown;
  graph?: GraphLike<object, unknown>;
}

export interface Graph<
  Ctx extends object,
  Ext,
  Defs extends Record<string, AnyDef> = Record<never, never>,
> {
  /**
   * The registry for bindings and forms. TYPE-complete (every field,
   * function-defined ones included, so `typedFields`/`<Field>` know every
   * key); at RUNTIME it holds the static defs only — resolution always passes
   * the freshly computed def, so nothing reads the runtime entries for
   * function fields.
   */
  readonly codecs: Defs;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly effects: readonly RuleUnit<any, Ext>[];
  resolve(f: Fields, ext: Ext): Ctx;

  field<K extends string, D extends AnyDef | null>(
    key: K,
    def: (ctx: Ctx, ext: Ext) => D
  ): Graph<
    Ctx &
      ([Extract<D, null>] extends [never]
        ? Record<K, DefValue<D>>
        : Partial<Record<K, DefValue<NonNullable<D>>>>),
    Ext,
    Defs & Record<K, NonNullable<D>>
  >;
  field<K extends string, D extends AnyDef>(
    key: K,
    def: D
  ): Graph<Ctx & Record<K, DefValue<D>>, Ext, Defs & Record<K, D>>;

  computed<K extends string, T>(
    key: K,
    calc: (ctx: Ctx, ext: Ext) => T
  ): Graph<Ctx & Record<K, T>, Ext, Defs>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effect(unit: RuleUnit<any, Ext>): Graph<Ctx, Ext, Defs>;

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
  use<C2 extends object, X2, D2 extends Record<string, AnyDef>>(
    child: GraphLike<C2, X2, D2> & NeedsCheck<Ctx & ([Ext] extends [object] ? Ext : unknown), X2>
  ): Graph<Ctx & C2, Ext, Defs & D2>;
  use<G>(fn: (g: this) => G): G;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function make<Ctx extends object, Ext>(entries: Entry[], effects: RuleUnit<any, Ext>[]): Graph<Ctx, Ext, Record<string, AnyDef>> {
  const codecs: Record<string, unknown> = {};
  for (const e of entries) {
    if (e.kind === 'field' && typeof e.def !== 'function') codecs[e.key] = e.def;
    if (e.kind === 'graph') Object.assign(codecs, e.graph!.codecs);
  }

  return {
    codecs: codecs as Record<string, AnyDef>,
    effects,

    resolve(f: Fields, ext: Ext): Ctx {
      const ctx: Record<string, unknown> = {};
      for (const e of entries) {
        if (e.kind === 'graph') {
          Object.assign(ctx, e.graph!.resolve(f, { ...(ext as object), ...ctx }));
          continue;
        }
        if (e.kind === 'computed') {
          ctx[e.key] = f.computed(e.key, e.calc!(ctx, ext));
          continue;
        }
        const def = typeof e.def === 'function' ? e.def(ctx, ext) : e.def;
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
        ctx[e.key] = f.field(e.key, codec, opts);
      }
      return ctx as Ctx;
    },

    field(key: string, def: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return make([...entries, { kind: 'field', key, def: def as Entry['def'] }], effects) as any;
    },

    computed(key: string, calc: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return make([...entries, { kind: 'computed', key, calc: calc as Entry['calc'] }], effects) as any;
    },

    effect(unit) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return make<Ctx, Ext>(entries, [...effects, unit]) as any;
    },

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
export interface GraphLike<
  Ctx,
  Ext,
  Defs extends Record<string, AnyFieldDef> = Record<string, AnyFieldDef>,
> {
  readonly codecs: Defs;
  // Ext-agnostic on purpose: a hub is usually mounted by a form whose Ext
  // differs (the resolver adapts ext before delegating), and the form still
  // needs to spread the hub's effects into its own reconcile list.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly effects: readonly RuleUnit<any, any>[];
  resolve(f: Fields, ext: Ext): Ctx;
  /** Attach a rule unit — same chain section as a graph's `.effect`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effect(unit: RuleUnit<any, any>): GraphLike<Ctx, Ext, Defs>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CtxOf<G> = G extends GraphLike<infer C, any, any> ? C : never;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (
  x: infer I
) => void
  ? I
  : never;

/** Every member's registry merged — what typedFields/<Field> read off a hub. */
type DefsOf<Members> =
  UnionToIntersection<
    { [M in keyof Members]: Members[M] extends { codecs: infer D } ? D : never }[keyof Members]
  > extends infer Merged extends Record<string, AnyFieldDef>
    ? Merged
    : Record<string, AnyFieldDef>;

const mergeMembers = <Ext>(members: Record<string, GraphLike<object, Ext>>) => {
  const codecs: Record<string, AnyFieldDef> = {};
  // members built by continuing one shared chain carry the SAME unit
  // instances — dedupe by identity so a prefix's effect merges once
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effects = new Set<RuleUnit<any, any>>();
  for (const g of Object.values(members)) {
    Object.assign(codecs, g.codecs);
    for (const e of g.effects) effects.add(e);
  }
  return { codecs, effects: [...effects] };
};

const chainable = <H extends { readonly effects: readonly unknown[] }>(hub: H): H => ({
  ...hub,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  effect(unit: RuleUnit<any, any>) {
    return chainable({ ...hub, effects: [...hub.effects, unit] });
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
export function branch<Ext, const Members extends Record<string, GraphLike<object, Ext>>>(
  pick: (ext: Ext) => keyof Members,
  members: Members
): GraphLike<CtxOf<Members[keyof Members]>, Ext, DefsOf<Members>> {
  return chainable({
    ...mergeMembers(members),
    resolve(f: Fields, ext: Ext) {
      return members[pick(ext)]!.resolve(f, ext) as CtxOf<Members[keyof Members]>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
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
  const Members extends Record<string, GraphLike<object, Ext>>,
  D extends AnyFieldDef = FieldDef<keyof Members & string, unknown>,
>(
  key: K,
  def: D & { output: SchemaLike<keyof Members & string> },
  members: Members
): GraphLike<
  { [M in keyof Members]: Record<K, M> & CtxOf<Members[M]> }[keyof Members],
  Ext,
  DefsOf<Members> & Record<K, D>
> {
  const merged = mergeMembers(members);
  merged.codecs[key] = def as AnyFieldDef;
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
