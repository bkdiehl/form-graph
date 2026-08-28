import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { codec, defineForm, type Fields } from '../index.js';

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
            }),
          refineDeps: [ext.gated.join('|')],
        }
      );
      return { mode };
    },
  });

  it('a refined-out value keeps its place, carries a LIVE error, and fails submit', () => {
    const store = form.createStore({ ext: { gated: ['b'] } });
    store.set({ mode: 'b' });

    // live, before any submit
    expect(store.getField('mode')?.value).toBe('b');
    expect(store.getField('mode')?.error?.message).toBe('Mode is gated');

    const result = store.validate();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.mode?.message).toBe('Mode is gated');
  });

  it('server parse applies the same refinement', () => {
    const result = form.parse({ mode: 'b' }, { gated: ['b'] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.mode?.message).toBe('Mode is gated');
  });

  it('the refinement lifts when the deps change', () => {
    const store = form.createStore({ ext: { gated: ['b'] } });
    store.set({ mode: 'b' });
    expect(store.getField('mode')?.error).toBeDefined();
    store.setExt({ gated: [] });
    expect(store.getField('mode')?.error).toBeUndefined();
    expect(store.validate().success).toBe(true);
  });

  it('schema construction is deps-cached: keystrokes do not rebuild', () => {
    const build = vi.fn((max: number) => z.number().max(max));
    const NUM = codec<number>({
      input: z.coerce.number().optional(),
      output: z.number(),
      default: 1,
    });
    const TEXT = codec<string>({
      input: z.string().optional(),
      output: z.string(),
      default: '',
    });
    const cachedForm = defineForm<{ max: number }>()({
      resolve: (f: Fields, ext) => ({
        n: f.field('n', NUM, {
          refine: () => build(ext.max),
          refineDeps: [ext.max],
        }),
        prompt: f.field('prompt', TEXT),
      }),
    });

    const store = cachedForm.createStore({ ext: { max: 10 } });
    expect(build).toHaveBeenCalledTimes(1);
    store.set({ prompt: 'a' });
    store.set({ prompt: 'ab' });
    store.set({ prompt: 'abc' });
    expect(build).toHaveBeenCalledTimes(1); // typing never reconstructs
    store.setExt({ max: 5 });
    expect(build).toHaveBeenCalledTimes(2); // the dep moved — one rebuild
  });
});
