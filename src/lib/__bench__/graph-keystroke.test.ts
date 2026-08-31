import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineGraph } from '../core/index.js';
import { defineForm } from '../core/form.js';
import { type Fields } from '../core/resolve.js';
import { boolOf, enumOf, slider, textOf } from '../core/def-helpers.js';

/**
 * Keystroke-cost guard over a representative ~25-field graph (helpers,
 * conditional defs, inline zod, a computed tail). Baseline on the LTX
 * generation port: ~20µs per keystroke for the full resolve + diff. The bound
 * here is deliberately generous (CI boxes are slow and shared) — it exists to
 * catch a CATASTROPHIC regression (an accidental O(n²), a schema rebuilt per
 * field per pass), not to flake on noise. The printed number is the signal;
 * compare it across runs when perf work happens.
 */
const graph = defineGraph<{ tier: 'free' | 'pro' }>()
  .field('mode', enumOf({
    options: [
      { value: 'create', label: 'Create' },
      { value: 'edit', label: 'Edit' },
    ],
    default: 'create',
  }))
  .field('prompt', {
    input: z.string().optional(),
    output: z.string().min(1, 'required'),
    default: '',
  })
  .field('negativePrompt', textOf({ maxLength: 2000 }))
  .field('seedLock', boolOf())
  .field('quality', (c) =>
    c.mode === 'create' ? slider({ min: 1, max: c._ext.tier === 'pro' ? 100 : 50, default: 25 }) : null
  )
  .field('strength', (c) => (c.mode === 'edit' ? slider({ min: 0, max: 1, step: 0.05, default: 0.6 }) : null))
  .field('format', enumOf({
    options: [
      { value: 'png', label: 'PNG' },
      { value: 'jpg', label: 'JPG' },
      { value: 'webp', label: 'WebP' },
    ],
    default: 'png',
    gate: {},
  }))
  .computed('summary', (c) => `${c.mode}:${c.prompt.length}`);

// widen to ~25 fields with a run of sliders
let wide = graph;
for (let i = 0; i < 16; i++) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wide = (wide as any).field(`extra${i}`, slider({ min: 0, max: 100, default: i }));
}

const form = defineForm({
  defs: wide.defs,
  resolve: (f: Fields, ext: { tier: 'free' | 'pro' }) => wide.resolve(f, ext),
});

describe('graph keystroke cost', () => {
  it('stays far under the catastrophe line', () => {
    const store = form.createStore({ ext: { tier: 'pro' } });
    for (let i = 0; i < 200; i++) store.set({ prompt: 'warm' + i });
    const N = 1000;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) store.set({ prompt: 'keystroke ' + i });
    const us = Number(process.hrtime.bigint() - t0) / N / 1000;
    console.log(`graph keystroke: ${us.toFixed(1)} µs (baseline ~20µs on the LTX port)`);
    expect(us).toBeLessThan(5000); // 5ms: catastrophic-regression line only
  });
});
