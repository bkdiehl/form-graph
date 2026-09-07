import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { textOf } from '../def-helpers.js';
import { defineGraph } from '../graph.js';
import { list } from '../list.js';

/**
 * revalidate: 'touched' (proposal-0.5 §3): a field the user has WRITTEN is
 * judged on every recompute — new failures surface live, lifts stay live.
 * Touched = written (the store stays UI-blind); pristine fields never scold
 * in either mode; the default ('submit') is byte-identical to today.
 */

const bounded = {
  input: z.coerce.number().optional(),
  output: z.number().min(1).max(20, 'Too many'),
  default: 5,
};

const form = defineGraph()
  .field('epochs', bounded)
  .field('name', {
    input: z.string().optional(),
    output: z.string().min(1, 'Name is required'),
    default: '',
  });

describe("revalidate: 'submit' (the default) — byte-identical to today", () => {
  it('a touched invalid field shows NOTHING until validate()', () => {
    const store = form.createStore();
    store.set({ epochs: 99 });
    expect(store.getField('epochs')?.error).toBeUndefined();
    expect(store.validate().success).toBe(false);
    expect(store.getField('epochs')?.error?.message).toBe('Too many');
  });
});

describe("revalidate: 'touched'", () => {
  const make = () => form.createStore({ ext: undefined, revalidate: 'touched' });

  it('a pristine field never scolds — even while another field is being edited', () => {
    const store = make();
    store.set({ epochs: 7 });
    expect(store.getField('name')?.error).toBeUndefined(); // required, empty, UNTOUCHED
  });

  it('the write that makes a touched field invalid surfaces its error live', () => {
    const store = make();
    store.set({ epochs: 99 });
    expect(store.getField('epochs')?.error?.message).toBe('Too many');
    expect(store.getField('name')?.error).toBeUndefined();
  });

  it('the error lifts live on the correcting write', () => {
    const store = make();
    store.set({ epochs: 99 });
    store.set({ epochs: 10 });
    expect(store.getField('epochs')?.error).toBeUndefined();
  });

  it('list element paths participate', () => {
    const runGraph = defineGraph().field('epochs', bounded);
    const host = defineGraph()
      .field('label', textOf({ default: '' }))
      .use(list('runs', runGraph, { min: 1, max: 3 }));
    const store = host.createStore({ ext: undefined, revalidate: 'touched' });
    store.set({ 'runs[s0].epochs': 99 });
    expect(store.getField('runs[s0].epochs')?.error?.message).toBe('Too many');
    store.set({ 'runs[s0].epochs': 3 });
    expect(store.getField('runs[s0].epochs')?.error).toBeUndefined();
  });

  it('reset clears touched — the field is pristine again until the next write', () => {
    const store = make();
    store.set({ epochs: 99 });
    expect(store.getField('epochs')?.error).toBeDefined();
    store.reset();
    expect(store.getField('epochs')?.error).toBeUndefined();
    store.set({ name: 'x' }); // a recompute — epochs stays unscolded
    expect(store.getField('epochs')?.error).toBeUndefined();
  });

  it('an external error and a live engine error follow the existing chain (external wins)', () => {
    const store = make();
    store.set({ epochs: 99 }); // live engine error
    store.setError('epochs', { message: 'server said no' });
    expect(store.getField('epochs')?.error?.message).toBe('server said no');
    store.clearError('epochs');
    expect(store.getField('epochs')?.error?.message).toBe('Too many'); // engine error back
  });
});

describe("revalidate: 'touched' — review-round pins", () => {
  it("a sibling scope bucket's pristine default never scolds (touched is ADDRESS-keyed)", () => {
    const scoped = defineGraph<{ family: string }>({ scope: (ext) => ext.family }).field('name', {
      input: z.string().optional(),
      output: z.string().min(1, 'Required'),
      default: '',
    });
    const store = scoped.createStore({ ext: { family: 'a' }, revalidate: 'touched' });
    store.set({ name: 'hello' }); // touches name@a only
    store.setExt({ family: 'b' }); // bucket b re-derives the pristine ''
    expect(store.getField('name')?.error).toBeUndefined();
    store.setExt({ family: 'a' }); // back: the user's write, valid
    expect(store.getField('name')?.error).toBeUndefined();
  });

  it('an error lifts live when its CONDITIONAL refinement disappears', () => {
    const graph = defineGraph()
      .field('hasImages', { input: z.boolean().optional(), output: z.boolean(), default: false })
      .field('prompt', ({ hasImages }) => ({
        input: z.string().optional(),
        output: z.string(),
        default: '',
        refine: hasImages
          ? undefined
          : (output: z.ZodString) => output.min(1, 'Prompt is required'),
      }));
    const store = graph.createStore({ ext: undefined, revalidate: 'touched' });
    store.set({ prompt: '' }); // touched; refinement fails live
    expect(store.getField('prompt')?.error?.message).toBe('Prompt is required');
    store.set({ hasImages: true }); // the refinement is GONE — same value, error must lift
    expect(store.getField('prompt')?.error).toBeUndefined();
    expect(store.validate().success).toBe(true);
  });

  it('the judge runs the REFINED schema, not the bare output (the parity claim)', () => {
    const graph = defineGraph().field('prompt', {
      input: z.string().optional(),
      output: z.string(), // accepts '' — only the refinement rejects it
      default: 'start',
      refine: (output: z.ZodString) => output.min(1, 'Required'),
    });
    const store = graph.createStore({ ext: undefined, revalidate: 'touched' });
    store.set({ prompt: '' });
    expect(store.getField('prompt')?.error?.message).toBe('Required');
  });

  it('clearing a field (set undefined) leaves it touched: undirty, but judged (the recorded divergence)', () => {
    const graph = defineGraph().field('name', {
      input: z.string().optional(),
      output: z.string().min(1, 'Required'),
      default: '',
    });
    const store = graph.createStore({ ext: undefined, revalidate: 'touched' });
    store.set({ name: 'x' });
    store.set({ name: undefined });
    expect(store.dirtyFields()).toEqual([]); // the write is gone
    expect(store.getField('name')?.error?.message).toBe('Required'); // but the user ACTED here
  });

  it('remove() sweeps the element bucket from touched — a later same-id element starts pristine', () => {
    const runGraph = defineGraph().field('epochs', bounded);
    const host = defineGraph().use(list('runs', runGraph, { min: 1, max: 3 }));
    const store = host.createStore({ ext: undefined, revalidate: 'touched' });
    const added = store.list('runs').add();
    if (!added.success) throw new Error('unexpected');
    store.set({ [`runs[${added.id}].epochs`]: 99 });
    expect(store.getField(`runs[${added.id}].epochs`)?.error).toBeDefined();
    store.list('runs').remove(added.id);
    expect(store.validate().success).toBe(true);
  });
});
