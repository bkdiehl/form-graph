import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { branchOn, defineGraph } from '../graph.js';
import type { StorageAdapter } from '../store.js';

const num = (dflt: number) => ({
  input: z.coerce.number().optional(),
  output: z.number(),
  default: dflt,
});

const ECO = {
  input: z.string().optional(),
  output: z.string(),
  default: 'Flux',
};

function captureAdapter(): StorageAdapter & { last: () => Record<string, unknown> } {
  let saved: Record<string, unknown> = {};
  return {
    load: () => saved,
    save: (intent) => {
      saved = intent as Record<string, unknown>;
    },
    last: () => saved,
  };
}

const family = defineGraph<{ eco: string }>()
  .scope((ext) => ext.eco)
  .field('steps', num(25))
  .field('bare', { ...num(1), scope: [] })
  .field('own', { ...num(2), scope: 'X' });

const root = defineGraph().field('eco', ECO).use(family);

describe('graph-level scope', () => {
  it('scopes declared fields by the ext-derived bucket; field scope and [] win', () => {
    const storage = captureAdapter();
    const store = root.createStore({ storage });
    store.set({ steps: 10, bare: 5, own: 7 });
    const saved = storage.last();
    expect(Object.keys(saved).sort()).toEqual(['bare', 'own@X', 'steps@Flux']);
  });

  it('gives each bucket its own memory across the discriminant switch', () => {
    const store = root.createStore({ storage: captureAdapter() });
    store.set({ steps: 10 });
    store.set({ eco: 'SD' });
    store.set({ steps: 30 });
    store.set({ eco: 'Flux' });
    expect((store.getSnapshot().state as { steps: number }).steps).toBe(10);
    store.set({ eco: 'SD' });
    expect((store.getSnapshot().state as { steps: number }).steps).toBe(30);
  });

  it('a fn returning undefined leaves the field unscoped', () => {
    const g = defineGraph<{ eco?: string }>()
      .scope((ext) => ext.eco)
      .field('steps', num(25));
    const storage = captureAdapter();
    const store = defineGraph().field('other', num(0)).use(g).createStore({ storage });
    store.set({ steps: 9 });
    expect(Object.keys(storage.last())).toEqual(['steps']);
  });

  it('a scoped graph as a BRANCH member keeps its own scope fn', () => {
    const DEST = {
      input: z.string().optional(),
      output: z.enum(['a', 'b']),
      default: 'a' as const,
    };
    const hub = branchOn('dest', DEST, { a: family, b: family });
    const root = defineGraph().field('eco', ECO).use(hub);
    const storage = captureAdapter();
    const store = root.createStore({ storage });
    store.set({ steps: 7 });
    expect(storage.last()['steps@Flux']).toBe(7);
  });

  it('a mounted child keeps its own scope fn (the parent does not leak)', () => {
    const parent = defineGraph()
      .scope(() => 'parent-bucket')
      .field('eco', ECO)
      .use(family);
    const storage = captureAdapter();
    const store = parent.createStore({ storage });
    store.set({ eco: 'SD', steps: 9 });
    expect(storage.last()['steps@SD']).toBe(9);
    expect(storage.last()['eco@parent-bucket']).toBe('SD');
  });
});
