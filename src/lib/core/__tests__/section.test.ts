import { describe, expect, it } from 'vitest';
import { defineForm, section, type Fields } from '../index.js';
import { boolOf, slider, textOf } from '../def-helpers.js';
import { defineGraph } from '../graph.js';

type Assert<T extends true> = T;
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

const withSampling = section()((g) =>
  g.field('steps', slider({ min: 1, max: 50, default: 25 })).field('seed', slider({ min: 0, max: 100, default: 0 }))
);

const withCaption = section<{ nsfw?: boolean }>()((g) =>
  g.field('caption', (ctx) => (ctx.nsfw ? null : textOf({ default: '' })))
);

describe('section', () => {
  const graph = defineGraph()
    .field('nsfw', boolOf())
    .use(withSampling)
    .use(withCaption);

  const form = defineForm({
    codecs: graph.codecs,
    resolve: (f: Fields) => graph.resolve(f, undefined as void),
  });

  it('appends its fields through .use, ctx flowing through', () => {
    const store = form.createStore();
    expect(store.getState()).toEqual({ nsfw: false, steps: 25, seed: 0, caption: '' });
    store.set({ nsfw: true });
    expect(store.getState()).toEqual({ nsfw: true, steps: 25, seed: 0 });
  });

  it('preserves the upstream ctx and registry types', () => {
    type State = ReturnType<typeof graph.resolve>;
    type _upstream = Assert<Equals<State['nsfw'], boolean>>;
    type _added = Assert<Equals<State['steps'], number>>;
    type _conditional = Assert<Equals<State['caption'], string | undefined>>;
    type _registry = Assert<
      Equals<keyof typeof graph.codecs, 'nsfw' | 'steps' | 'seed' | 'caption'>
    >;
    // runtime codecs hold static defs only — caption is function-defined
    expect(Object.keys(graph.codecs).sort()).toEqual(['nsfw', 'seed', 'steps']);
  });

  it("does NOT leak its Needs keys into a consumer's state", () => {
    // withCaption needs { nsfw?: boolean }; a graph that never declares nsfw
    // still satisfies it — and must not grow an nsfw key from the section.
    const bare = defineGraph().use(withSampling).use(withCaption);
    type BareState = ReturnType<typeof bare.resolve>;
    type _noLeak = Assert<Equals<'nsfw' extends keyof BareState ? true : false, false>>;
    expect(Object.keys(bare.codecs).sort()).toEqual(['seed', 'steps']);
  });

  it('rejects a consumer missing a REQUIRED need, at the type level', () => {
    const needsFlag = section<{ flag: boolean }>()((g) =>
      g.field('extra', (ctx) => (ctx.flag ? textOf({ default: '' }) : null))
    );
    // @ts-expect-error — ctx has no `flag`, and the need is required
    defineGraph().use(needsFlag);
    defineGraph().field('flag', boolOf()).use(needsFlag);
    expect(true).toBe(true);
  });

  it('.use is plain application', () => {
    const g = defineGraph();
    const viaUse = g.use(withSampling);
    const direct = withSampling(g);
    expect(Object.keys(viaUse.codecs)).toEqual(Object.keys(direct.codecs));
  });
});
