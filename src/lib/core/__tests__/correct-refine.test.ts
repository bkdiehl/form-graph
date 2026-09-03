import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { codec } from '../codec.js';
import { defineForm } from '../form.js';
import { type Fields } from '../resolve.js';

const STEPS = codec<number>({
  input: z.coerce.number().optional(),
  output: z.number().int().min(1),
  default: 25,
});

describe('f.correct: correction as a resolver STATEMENT', () => {
  const form = defineForm<{ max: number }>()({
    resolve: (f: Fields, ext) => {
      let steps = f.field('steps', STEPS, {
        meta: (value) => ({ max: ext.max, current: value }),
      });
      if (steps > ext.max) steps = f.correct('steps', ext.max, 'over_ceiling', { max: ext.max });
      return { steps };
    },
  });

  it('state can never hold a value the correction statement would replace', () => {
    const store = form.createStore({ ext: { max: 30 } });
    store.set({ steps: 50 });
    expect(store.getField('steps')?.value).toBe(30);
    // the engine fills key/from/to; the author supplies reason + extra detail
    expect(store.getNotes()).toEqual([
      { key: 'steps', kind: 'over_ceiling', detail: { from: 50, to: 30, max: 30 } },
    ]);
    // the snapshot carries the field's own note for inline display
    expect(store.getField('steps')?.note?.kind).toBe('over_ceiling');
  });

  it('value-derived meta is recomputed from the corrected value', () => {
    const store = form.createStore({ ext: { max: 30 } });
    store.set({ steps: 50 });
    expect(store.getField('steps')?.meta).toEqual({ max: 30, current: 30 });
  });

  it('intent keeps the original: relax the ceiling and the value returns', () => {
    const store = form.createStore({ ext: { max: 30 } });
    store.set({ steps: 50 });
    store.setExt({ max: 100 });
    expect(store.getField('steps')?.value).toBe(50);
    expect(store.getNotes()).toEqual([]);
  });

  it('no correction call records nothing', () => {
    const store = form.createStore({ ext: { max: 30 } });
    store.set({ steps: 10 });
    expect(store.getNotes()).toEqual([]);
    expect(store.getField('steps')?.note).toBeUndefined();
  });

  it('correcting an undeclared or computed key throws', () => {
    const bad = defineForm({
      resolve: (f: Fields) => {
        f.correct('ghost', 1, 'nope');
        return {};
      },
    });
    expect(() => bad.parse({}, undefined)).toThrowError(/no field/);

    const badComputed = defineForm({
      resolve: (f: Fields) => {
        const total = f.computed('total', 5);
        f.correct('total', 1, 'nope');
        return { total };
      },
    });
    expect(() => badComputed.parse({}, undefined)).toThrowError(/computed/);
  });
});

describe('refine: the output contract narrowed per pass, in zod vocabulary', () => {
  const form = defineForm<{ gated: string[] }>()({
    resolve: (f: Fields, ext) => {
      const mode = f.field(
        'mode',
        codec<string>({ input: z.string().optional(), output: z.string(), default: 'a' }),
        {
          refine: (s) =>
            s.refine((value) => !ext.gated.includes(value), {
              message: 'Mode is gated',
              params: { kind: 'gated' },
            }),        }
      );
      return { mode };
    },
  });

  it('a refined-out value keeps its place; the error surfaces at validate(), not live', () => {
    const store = form.createStore({ ext: { gated: ['b'] } });
    store.set({ mode: 'b' });

    // NOT live — like the output schema it narrows, refine judges at submit
    expect(store.getField('mode')?.value).toBe('b');
    expect(store.getField('mode')?.error).toBeUndefined();

    const result = store.validate();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.mode?.message).toBe('Mode is gated');
    expect(store.getField('mode')?.error?.message).toBe('Mode is gated');
  });

  it('server parse applies the same refinement', () => {
    const result = form.parse({ mode: 'b' }, { gated: ['b'] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.mode?.message).toBe('Mode is gated');
  });

  it('the refinement lifts when the deps change', () => {
    const store = form.createStore({ ext: { gated: ['b'] } });
    store.set({ mode: 'b' });
    expect(store.validate().success).toBe(false);
    store.setExt({ gated: [] });
    expect(store.getField('mode')?.error).toBeUndefined();
    expect(store.validate().success).toBe(true);
  });

  it('refinements are never stale: the closure sees current values every pass', () => {
    const NUM = codec<number>({
      input: z.coerce.number().optional(),
      output: z.number(),
      default: 1,
    });
    const CAP = codec<number>({
      input: z.coerce.number().optional(),
      output: z.number(),
      default: 10,
    });
    const form = defineForm({
      resolve: (f: Fields) => {
        const cap = f.field('cap', CAP);
        return {
          cap,
          n: f.field('n', NUM, {
            // no deps to declare — rebuilt per pass, always over the live cap
            refine: (s) => s.refine((v) => v <= cap, { message: 'over cap' }),
          }),
        };
      },
    });

    const store = form.createStore({ defaults: { n: 8 } });
    expect(store.validate().success).toBe(true);
    store.set({ cap: 5 });
    // submit-time: the stale-free closure sees the live cap when judged
    expect(store.validate().success).toBe(false);
    expect(store.getField('n')?.error?.message).toBe('over cap');
    // the surfaced error lifts as soon as a pass's refinement passes again
    store.set({ cap: 20 });
    expect(store.getField('n')?.error).toBeUndefined();
  });
});
