import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineGraph } from '../graph.js';

const HOISTED = {
  input: z.string().optional(),
  output: z.string(),
  default: 'a',
};

/**
 * The churn tracker keys on SCHEMA identity, not def-object identity: a def
 * factory returns a fresh object every pass by design (that's the whole
 * conditional-field mechanism), and spreading a hoisted def costs nothing.
 * Only genuinely rebuilding the schemas per pass is the keystroke-path cost.
 */
describe('codec churn tracking', () => {
  it('a factory spreading a hoisted def is NOT churn', () => {
    const graph = defineGraph<Record<string, never>>()
      .field('mode', { input: z.string().optional(), output: z.string(), default: 'x' })
      .field('stable', ({ mode }) => (mode === 'never' ? null : { ...HOISTED }));
    const store = graph.createStore({ ext: {}, warnOnCodecChurn: false });
    for (let i = 0; i < 6; i++) store.set({ stable: `v${i}` });
    expect(store.getCodecChurn()).toEqual([]);
  });

  it('a cached input does NOT mask a per-pass rebuilt output', () => {
    const HOISTED_INPUT = z.string().optional();
    const graph = defineGraph<Record<string, never>>()
      .field('mode', { input: z.string().optional(), output: z.string(), default: 'x' })
      .field('respread', ({ mode }) =>
        mode === 'never'
          ? null
          : {
              input: HOISTED_INPUT,
              // the requiredness-by-output-spread pattern: base cached, output rebuilt
              output: z.string().min(1, 'Required'),
              default: 'a',
            }
      );
    const store = graph.createStore({ ext: {}, warnOnCodecChurn: false });
    for (let i = 0; i < 6; i++) store.set({ respread: `v${i}` });
    expect(store.getCodecChurn()).toEqual(['respread']);
  });

  it('a factory building schemas inline every pass IS churn', () => {
    const graph = defineGraph<Record<string, never>>()
      .field('mode', { input: z.string().optional(), output: z.string(), default: 'x' })
      .field('churny', ({ mode }) =>
        mode === 'never'
          ? null
          : { input: z.string().optional(), output: z.string(), default: 'a' }
      );
    const store = graph.createStore({ ext: {}, warnOnCodecChurn: false });
    for (let i = 0; i < 6; i++) store.set({ churny: `v${i}` });
    expect(store.getCodecChurn()).toEqual(['churny']);
  });
});
