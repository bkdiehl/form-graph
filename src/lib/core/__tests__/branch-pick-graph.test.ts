import { describe, expect, it } from 'vitest';
import { branch, defineGraph } from '../graph.js';
import { slider, textOf } from '../def-helpers.js';

/**
 * A tagged branch's pick may return the member GRAPH itself instead of its
 * key — the members record stays the manifest (defs merge, state union, tag
 * stamping via reverse lookup), but routing reads as plain control flow over
 * the graphs.
 */

const fast = defineGraph<{ kind: string }>().field('steps', slider({ min: 1, max: 10, default: 4 }));
const full = defineGraph<{ kind: string }>()
  .field('steps', slider({ min: 10, max: 50, default: 30 }))
  .field('note', textOf({ default: 'full' }));

describe('branch picks that return the member graph', () => {
  it('the stamped key comes from the manifest by reverse lookup', () => {
    const hub = branch('mode', (ext: { kind: string }) => (ext.kind === 'fast' ? fast : full), {
      fast,
      full,
    });
    const result = hub.parse({}, { kind: 'fast' });
    if (!result.success) throw new Error('unexpected');
    expect((result.state as { mode: string }).mode).toBe('fast');
    expect((result.data as { mode: string }).mode).toBe('fast');
    expect((result.state as { steps: number }).steps).toBe(4);
  });

  it('a graph that is not in the manifest is a loud error', () => {
    const stranger = defineGraph<{ kind: string }>().field('x', textOf({ default: '' }));
    const hub = branch('mode', (_ext: { kind: string }) => stranger as unknown as typeof fast, {
      fast,
      full,
    });
    expect(() => hub.parse({}, { kind: 'fast' })).toThrow(/not one of the members/);
  });

  it('key-returning picks still work unchanged', () => {
    const hub = branch('mode', (ext: { kind: string }) => (ext.kind === 'fast' ? 'fast' : 'full'), {
      fast,
      full,
    });
    const result = hub.parse({}, { kind: 'fast' });
    if (!result.success) throw new Error('unexpected');
    expect((result.state as { steps: number }).steps).toBe(4);
  });

  it('emit: false keeps the tag in state but off the wire', () => {
    const hub = branch(
      'mode',
      (ext: { kind: string }) => (ext.kind === 'fast' ? fast : full),
      { fast, full },
      { emit: false }
    );
    const result = hub.parse({}, { kind: 'fast' });
    if (!result.success) throw new Error('unexpected');
    expect((result.state as { mode: string }).mode).toBe('fast');
    expect(result.data).not.toHaveProperty('mode');
  });
});
