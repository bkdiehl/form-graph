import { describe, expect, it } from 'vitest';
import { defineGraph } from '../graph.js';
import { parseFixpoint } from '../fixpoint.js';
import { enumOf } from '../def-helpers.js';

/**
 * The civitai Wan 2.1 shape in miniature: `variant` is corrected off
 * `resolution`, but `resolution` is declared AFTER it — so a single pass sees
 * only the fed-back value from the previous pass.
 */
type Ext = { mode: string; resolvedResolution?: string };

const graph = defineGraph<Ext>()
  .field('variant', ({ _ext }) => ({
    ...enumOf({
      options: [
        { value: 'lo', label: 'Lo' },
        { value: 'hi', label: 'Hi' },
      ],
      default: 'lo',
    }),
    correct: (value: 'lo' | 'hi') => {
      if (_ext.mode !== 'auto') return undefined;
      const target = (_ext.resolvedResolution ?? '480p') === '480p' ? 'lo' : 'hi';
      return target === value ? undefined : { value: target, reason: 'resolution_sync' };
    },
  }))
  .field(
    'resolution',
    enumOf({
      options: [
        { value: '480p', label: '480p' },
        { value: '720p', label: '720p' },
      ],
      default: '480p',
    })
  );

const feedback = (state: { resolution?: string }) =>
  state.resolution !== undefined ? { resolvedResolution: state.resolution } : null;

describe('parseFixpoint', () => {
  it('converges when the dependent field needs a later field', () => {
    // single pass gets it WRONG (variant stays lo); the fixpoint fixes it
    const single = graph.parse({ resolution: '720p' }, { mode: 'auto' });
    expect(single.success && single.data.variant).toBe('lo');

    const fixed = parseFixpoint(graph, { resolution: '720p' }, { mode: 'auto' }, feedback);
    expect(fixed.success && fixed.data.variant).toBe('hi');
  });

  it('returns immediately when the first pass already converged', () => {
    let calls = 0;
    const counting = {
      parse: (raw: Record<string, unknown>, ext: Ext) => {
        calls++;
        return graph.parse(raw, ext);
      },
    };
    const result = parseFixpoint(counting, { resolution: '480p' }, { mode: 'auto' }, feedback);
    expect(result.success).toBe(true);
    expect(calls).toBe(2); // one resolve + one confirming compare — never more
  });

  it('passes a FAILED parse straight through, without iterating', () => {
    let calls = 0;
    const failing = {
      parse: () => {
        calls++;
        return { success: false as const, errors: { x: { message: 'no' } }, notes: [] } as never;
      },
    };
    const failed = parseFixpoint(failing, {}, { mode: 'auto' }, () => null);
    expect(failed.success).toBe(false);
    expect(calls).toBe(1);
  });

  it('THROWS on an oscillating feedback loop instead of returning a wobble', () => {
    let flip = false;
    const oscillating = {
      parse: (_raw: Record<string, unknown>, _ext: Ext) => {
        flip = !flip;
        return {
          success: true as const,
          data: { v: flip ? 'a' : 'b' },
          state: { v: flip ? 'a' : 'b' },
          notes: [],
        } as never;
      },
    };
    expect(() =>
      parseFixpoint(oscillating, {}, { mode: 'auto' }, () => ({ resolvedResolution: 'x' }))
    ).toThrow(/no convergence/);
  });
});
