import { describe, expect, it } from 'vitest';
import { defineForm, type Fields } from '../index.js';
import { boolOf, enumOf, slider, textOf } from '../def-helpers.js';
import { branchOn, defineGraph } from '../graph.js';

type Assert<T extends true> = T;
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

// A reusable section is an ordinary graph; its Ext declares what it NEEDS
// from wherever it is mounted.
const sampling = defineGraph()
  .field('steps', slider({ min: 1, max: 50, default: 25 }))
  .field('seed', slider({ min: 0, max: 100, default: 0 }));

const caption = defineGraph<{ nsfw?: boolean }>().field('caption', (_ctx, ext) =>
  ext.nsfw ? null : textOf({ default: '' })
);

describe('the graph IS the form: runtime on the definition', () => {
  it('createStore wires the registry and the effects, no mounting step', () => {
    const graph = defineGraph()
      .field('steps', slider({ min: 1, max: 50, default: 25 }))
      .effect({
        steps: (steps) => (typeof steps === 'number' && steps > 40 ? { steps: 40 } : undefined),
      });
    const store = graph.createStore();
    store.set({ steps: 50 });
    expect(store.getState()).toEqual({ steps: 40 });
  });

  it('parse is the same pipeline server-side', () => {
    const graph = defineGraph().field('steps', slider({ min: 1, max: 50, default: 25 }));
    const result = graph.parse({ steps: 30 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ steps: 30 });
  });

  it('flows ext through, typed', () => {
    type Ext = { max: number };
    const graph = defineGraph<Ext>().field('steps', (_ctx, ext) =>
      slider({ min: 1, max: ext.max, default: 1 })
    );
    const store = graph.createStore({ ext: { max: 7 } });
    expect(store.getField('steps')?.meta).toMatchObject({ max: 7 });
  });

  it('hubs carry the runtime too', () => {
    const hub = branchOn(
      'kind',
      enumOf({
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
        default: 'a',
      }),
      {
        a: defineGraph().field('x', slider({ min: 0, max: 9, default: 1 })),
        b: defineGraph().field('y', slider({ min: 0, max: 9, default: 2 })),
      }
    );
    const store = hub.createStore();
    expect(store.getState()).toEqual({ kind: 'a', x: 1 });
    store.set({ kind: 'b' });
    expect(store.getState()).toEqual({ kind: 'b', y: 2 });
  });
});

describe('mounting a graph with .use', () => {
  const graph = defineGraph().field('nsfw', boolOf()).use(sampling).use(caption);

  const form = defineForm({
    defs: graph.defs,
    resolve: (f: Fields) => graph.resolve(f),
  });

  it("appends the child's fields; its needs are satisfied by prior ctx", () => {
    const store = form.createStore();
    expect(store.getState()).toEqual({ nsfw: false, steps: 25, seed: 0, caption: '' });
    store.set({ nsfw: true });
    expect(store.getState()).toEqual({ nsfw: true, steps: 25, seed: 0 });
  });

  it('preserves the upstream ctx and merges the registries', () => {
    type State = ReturnType<typeof graph.resolve>;
    type _upstream = Assert<Equals<State['nsfw'], boolean>>;
    type _added = Assert<Equals<State['steps'], number>>;
    type _conditional = Assert<Equals<State['caption'], string | undefined>>;
    type _registry = Assert<
      Equals<keyof typeof graph.defs, 'nsfw' | 'steps' | 'seed' | 'caption'>
    >;
    expect(Object.keys(graph.defs).sort()).toEqual(['nsfw', 'seed', 'steps']);
  });

  it("does NOT leak the child's needs into the parent's state", () => {
    // caption needs { nsfw?: boolean } — optional, so a parent that never
    // declares nsfw still mounts it, and must not grow an nsfw key.
    const bare = defineGraph().use(sampling).use(caption);
    type BareState = ReturnType<typeof bare.resolve>;
    type _noLeak = Assert<Equals<'nsfw' extends keyof BareState ? true : false, false>>;
    expect(Object.keys(bare.defs).sort()).toEqual(['seed', 'steps']);
  });

  it('rejects a parent missing a REQUIRED need, at the type level', () => {
    const needsFlag = defineGraph<{ flag: boolean }>().field('extra', (_ctx, ext) =>
      ext.flag ? textOf({ default: '' }) : null
    );
    // @ts-expect-error — nothing upstream declares `flag`, and the need is required
    defineGraph().use(needsFlag);
    defineGraph().field('flag', boolOf()).use(needsFlag);
    expect(true).toBe(true);
  });

  it("carries the child's effects through the mount", () => {
    const child = defineGraph()
      .field('steps', slider({ min: 1, max: 50, default: 25 }))
      .effect({
        steps: (steps) => (typeof steps === 'number' && steps > 40 ? { steps: 40 } : undefined),
      });
    const parent = defineGraph().use(child);
    expect(parent.effects).toHaveLength(1);

    const capped = defineForm({
      defs: parent.defs,
      reconcile: [...parent.effects],
      resolve: (f: Fields) => parent.resolve(f),
    });
    const store = capped.createStore();
    store.set({ steps: 50 });
    expect(store.getState()).toEqual({ steps: 40 });
  });

  it("the parent's own ext also satisfies a child's needs", () => {
    type Ext = { limit: number };
    const child = defineGraph<{ limit: number }>().field('quantity', (_ctx, ext) =>
      slider({ min: 1, max: ext.limit, default: 1 })
    );
    const parent = defineGraph<Ext>().use(child);
    const form = defineForm({
      defs: parent.defs,
      resolve: (f: Fields, ext: Ext) => parent.resolve(f, ext),
    });
    const store = form.createStore({ ext: { limit: 4 } });
    expect(store.getField('quantity')?.meta).toMatchObject({ max: 4 });
  });

  it('.use with a function is plain application', () => {
    const addSeed = <G extends { field: (k: string, d: unknown) => unknown }>(g: G) =>
      g.field('seed', slider({ min: 0, max: 100, default: 0 }));
    const viaUse = defineGraph().use((g) => g.field('seed', slider({ min: 0, max: 100, default: 0 })));
    expect(Object.keys(viaUse.defs)).toEqual(['seed']);
    void addSeed;
  });
});
