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
  kind: 'field' | 'computed';
  key: string;
  def?: DefArg<unknown, unknown>;
  calc?: (ctx: unknown, ext: unknown) => unknown;
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function make<Ctx extends object, Ext>(entries: Entry[], effects: RuleUnit<any, Ext>[]): Graph<Ctx, Ext, Record<string, AnyDef>> {
  const codecs: Record<string, unknown> = {};
  for (const e of entries) {
    if (e.kind === 'field' && typeof e.def !== 'function') codecs[e.key] = e.def;
  }

  return {
    codecs: codecs as Record<string, AnyDef>,
    effects,

    resolve(f: Fields, ext: Ext): Ctx {
      const ctx: Record<string, unknown> = {};
      for (const e of entries) {
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
  };
}

export function defineGraph<Ext = void>(): Graph<Record<never, never>, Ext> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return make([], []) as any;
}
