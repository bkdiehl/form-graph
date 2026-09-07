import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { enumOf, textOf } from '../def-helpers.js';
import { branch, defineGraph } from '../graph.js';
import { list } from '../list.js';

/**
 * isDirty / dirtyFields (proposal-0.5 §1): dirty means "the user WROTE this
 * here, this session" — non-ephemeral trusted intent, scope-collapsed.
 * Adopted defaults, storage-loaded values and boundary seeds don't count.
 */

const s3 = defineGraph().field('bucket', textOf({ default: 'assets' }));
const email = defineGraph().field('recipient', textOf({ default: '' }));
const hub = defineGraph()
  .field(
    'destination',
    enumOf({
      options: [
        { value: 's3', label: 'S3' },
        { value: 'email', label: 'Email' },
      ],
      default: 's3',
    })
  )
  .field('prompt', textOf({ default: '' }))
  .use(
    branch('destination', [
      [['s3'], s3],
      [['email'], email],
    ] as const)
  );

describe('isDirty / dirtyFields', () => {
  it('a fresh store is clean — adopted defaults are not dirt', () => {
    const store = hub.createStore();
    expect(store.isDirty()).toBe(false);
    expect(store.dirtyFields()).toEqual([]);
  });

  it('a set() marks exactly the written field', () => {
    const store = hub.createStore();
    store.set({ prompt: 'a cat' });
    expect(store.isDirty()).toBe(true);
    expect(store.dirtyFields()).toEqual(['prompt']);
  });

  it('storage-loaded values are the BASELINE, not dirt', () => {
    const store = hub.createStore({
      storage: { load: () => ({ prompt: 'stored draft' }), save: () => undefined },
    });
    expect(store.isDirty()).toBe(false);
  });

  it('a field written under two branch buckets reports ONCE, scope-collapsed', () => {
    const scoped = defineGraph<{ family: string }>({ scope: (ext) => ext.family }).field(
      'steps',
      { input: z.coerce.number().optional(), output: z.number(), default: 5 }
    );
    const store = scoped.createStore({ ext: { family: 'X' } });
    store.set({ steps: 7 });
    store.setExt({ family: 'Y' });
    store.set({ steps: 9 });
    expect(store.dirtyFields()).toEqual(['steps']);
  });

  it('list element writes report by their path', () => {
    const runGraph = defineGraph().field('epochs', {
      input: z.coerce.number().optional(),
      output: z.number(),
      default: 5,
    });
    const host = defineGraph().use(list('runs', runGraph, { min: 1, max: 3 }));
    const store = host.createStore();
    store.set({ 'runs[s0].epochs': 9 });
    expect(store.dirtyFields()).toContain('runs[s0].epochs');
  });

  it('reset cleans; writing the default back stays dirty (the recorded divergence)', () => {
    const store = hub.createStore();
    store.set({ prompt: 'x' });
    store.reset();
    expect(store.isDirty()).toBe(false);
    store.set({ prompt: '' }); // the default value, typed by hand
    expect(store.isDirty()).toBe(true);
  });
});
