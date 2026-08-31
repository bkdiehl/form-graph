import { describe, expect, it } from 'vitest';
import { defineForm, type Fields } from '../index.js';
import { boolOf, slider, textOf } from '../def-helpers.js';
import { defineGraph } from '../graph.js';

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

describe('mounting a graph with .use', () => {
  const graph = defineGraph().field('nsfw', boolOf()).use(sampling).use(caption);

  const form = defineForm({
    codecs: graph.codecs,
    resolve: (f: Fields) => graph.resolve(f, undefined as void),
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
      Equals<keyof typeof graph.codecs, 'nsfw' | 'steps' | 'seed' | 'caption'>
    >;
    expect(Object.keys(graph.codecs).sort()).toEqual(['nsfw', 'seed', 'steps']);
  });

  it("does NOT leak the child's needs into the parent's state", () => {
    // caption needs { nsfw?: boolean } — optional, so a parent that never
    // declares nsfw still mounts it, and must not grow an nsfw key.
    const bare = defineGraph().use(sampling).use(caption);
    type BareState = ReturnType<typeof bare.resolve>;
    type _noLeak = Assert<Equals<'nsfw' extends keyof BareState ? true : false, false>>;
    expect(Object.keys(bare.codecs).sort()).toEqual(['seed', 'steps']);
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
      codecs: parent.codecs,
      reconcile: [...parent.effects],
      resolve: (f: Fields) => parent.resolve(f, undefined as void),
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
      codecs: parent.codecs,
      resolve: (f: Fields, ext: Ext) => parent.resolve(f, ext),
    });
    const store = form.createStore({ ext: { limit: 4 } });
    expect(store.getField('quantity')?.meta).toMatchObject({ max: 4 });
  });

  it('.use with a function is plain application', () => {
    const addSeed = <G extends { field: (k: string, d: unknown) => unknown }>(g: G) =>
      g.field('seed', slider({ min: 0, max: 100, default: 0 }));
    const viaUse = defineGraph().use((g) => g.field('seed', slider({ min: 0, max: 100, default: 0 })));
    expect(Object.keys(viaUse.codecs)).toEqual(['seed']);
    void addSeed;
  });
});
