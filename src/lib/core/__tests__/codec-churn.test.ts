import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { codec, defineForm, type Fields } from '../index.js';
import { defaultExt, miniForm } from '../../__fixtures__/mini-generation.js';

/**
 * Guards the single performance rule of this design: codecs are built once, not
 * per pass. See src/__bench__/keystroke.bench.ts — per-pass construction cost
 * 152x on a 35-field keystroke, and nothing about the resolver looks wrong.
 */
describe('codec churn guard', () => {
  it('flags a field whose codec is rebuilt on every pass', () => {
    const churnyForm = defineForm<void>()({
      resolve: (f: Fields) => ({
        // A fresh zod schema per pass — the mistake this guard exists to catch.
        steps: f.field('steps', codec<number>({ output: z.number(), default: 1 })),
      }),
    });

    const store = churnyForm.createStore({ ext: undefined, warnOnCodecChurn: false });
    for (let i = 0; i < 5; i++) store.set({ steps: i + 1 });

    expect(store.getCodecChurn()).toEqual(['steps']);
  });

  it('stays quiet for hoisted codecs', () => {
    const stable = codec<number>({ output: z.number(), default: 1 });
    const cleanForm = defineForm<void>()({
      resolve: (f: Fields) => ({ steps: f.field('steps', stable) }),
    });

    const store = cleanForm.createStore({ ext: undefined, warnOnCodecChurn: false });
    for (let i = 0; i < 5; i++) store.set({ steps: i + 1 });

    expect(store.getCodecChurn()).toEqual([]);
  });

  it('tolerates a one-off codec change from a branch switch', () => {
    const store = miniForm.createStore({ ext: defaultExt, warnOnCodecChurn: false });

    // `steps` legitimately uses a different codec in the SD branch than in Flux.
    store.set({ ecosystem: 'SD' });
    store.set({ ecosystem: 'Flux' });
    store.set({ prompt: 'a cat' });
    store.set({ prompt: 'a dog' });

    expect(store.getCodecChurn()).toEqual([]);
  });

  it('keeps the real fixture free of churn', () => {
    const store = miniForm.createStore({ ext: defaultExt, warnOnCodecChurn: false });
    for (const text of ['a', 'a c', 'a ca', 'a cat', 'a cat!']) store.set({ prompt: text });

    expect(store.getCodecChurn()).toEqual([]);
  });
});
