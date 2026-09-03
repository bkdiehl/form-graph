import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineGraph } from '../graph.js';

const PROMPT = {
  input: z.string().optional(),
  output: z.string(),
  default: '',
};

/**
 * `refine` on a FieldDef is the graph-layer route to the engine's per-pass
 * output narrowing: the cached base schemas stay shared while only a small
 * wrapper is built each pass — the sanctioned replacement for rebuilding
 * `output` inline (which the churn tracker names).
 */
describe('FieldDef.refine', () => {
  const graph = defineGraph<Record<string, never>>()
    .field('hasImages', { input: z.boolean().optional(), output: z.boolean(), default: false })
    .field('prompt', ({ hasImages }) => ({
      ...PROMPT,
      refine: hasImages
        ? undefined
        : (output: z.ZodString) => output.min(1, 'Prompt is required'),
    }));

  it('a failing refine keeps the value and carries a live error', () => {
    const store = graph.createStore({ ext: {} });
    const snap = store.getSnapshot().fields.get('prompt');
    expect(snap?.error?.message).toBe('Prompt is required');
    expect(snap?.value).toBe('');
  });

  it('the refinement follows the pass conditions', () => {
    const store = graph.createStore({ ext: {} });
    store.set({ hasImages: true });
    expect(store.getSnapshot().fields.get('prompt')?.error).toBeUndefined();
  });

  it('parse enforces the refined output', () => {
    expect(graph.parse({ prompt: '' }, {}).success).toBe(false);
    expect(graph.parse({ prompt: 'a cat' }, {}).success).toBe(true);
    expect(graph.parse({ hasImages: true, prompt: '' }, {}).success).toBe(true);
  });

  it('base schemas stay cached across passes (no churn)', () => {
    const store = graph.createStore({ ext: {}, warnOnCodecChurn: false });
    for (let i = 0; i < 6; i++) store.set({ prompt: `v${i}` });
    expect(store.getCodecChurn()).toEqual([]);
  });
});
