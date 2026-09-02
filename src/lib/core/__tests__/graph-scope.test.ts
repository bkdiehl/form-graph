import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { branch, defineGraph } from '../graph.js';
import { rootScope } from '../scope.js';
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

const family = defineGraph<{ eco: string }>({ scope: (ext) => ext.eco })
  .field('steps', num(25))
  .field('inherited', { ...num(1), scope: [] })
  .field('appended', { ...num(2), scope: 'X' })
  .field('global', { ...num(3), scope: rootScope() })
  .field('absolute', { ...num(4), scope: rootScope('abs') });

const root = defineGraph().field('eco', ECO).use(family);

describe('graph-level scope', () => {
  it('fields inherit the graph bucket; plain scopes APPEND; rootScope escapes', () => {
    const storage = captureAdapter();
    const store = root.createStore({ storage });
    store.set({ steps: 10, inherited: 5, appended: 7, global: 8, absolute: 9 });
    expect(storage.last()).toEqual({
      'steps@Flux': 10,
      'inherited@Flux': 5, // [] adds nothing — still bounded by the graph
      'appended@Flux/X': 7, // plain values nest under the inherited path
      global: 8, // rootScope() detaches to the bare key
      'absolute@abs': 9, // rootScope(parts) sets the path from the root
    });
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

  it('a fn returning undefined contributes nothing (fields stay at the inherited path)', () => {
    const g = defineGraph<{ eco?: string }>({ scope: (ext) => ext.eco }).field('steps', num(25));
    const storage = captureAdapter();
    const store = defineGraph().field('other', num(0)).use(g).createStore({ storage });
    store.set({ steps: 9 });
    expect(Object.keys(storage.last())).toEqual(['steps']);
  });

  it('scope NESTS through .use: parent segments prefix the child contribution', () => {
    const child = defineGraph({ scope: () => 'textFields' }).field('prompt', num(0));
    const scopeless = defineGraph().field('plain', num(0));
    const parent = defineGraph<{ eco: string }>({ scope: (ext) => ext.eco })
      .use(child)
      .use(scopeless);
    const outer = defineGraph().field('eco', ECO).use(parent);
    const storage = captureAdapter();
    const store = outer.createStore({ storage });
    store.set({ prompt: 1, plain: 2 });
    expect(storage.last()['prompt@Flux/textFields']).toBe(1);
    // a scopeless child inherits the accumulated path as-is
    expect(storage.last()['plain@Flux']).toBe(2);
  });

  it('a scoped graph as a BRANCH member nests under the mounting path', () => {
    const DEST = {
      input: z.string().optional(),
      output: z.enum(['a', 'b']),
      default: 'a' as const,
    };
    const wrapped = defineGraph({ scope: () => 'outer' })
      .field('eco', ECO)
      .field('dest', DEST)
      .use(branch('dest', [[['a', 'b'], family]] as const));
    const storage = captureAdapter();
    const store = wrapped.createStore({ storage });
    store.set({ steps: 7, global: 8 });
    expect(storage.last()['steps@outer/Flux']).toBe(7);
    // rootScope escapes the whole ancestry, member position included
    expect(storage.last()['global']).toBe(8);
  });
});
