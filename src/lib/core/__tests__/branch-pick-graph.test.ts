import { describe, expect, it } from 'vitest';
import { branch, defineGraph } from '../graph.js';
import { slider, textOf } from '../def-helpers.js';

/**
 * A branch pick may return the member GRAPH itself instead of its key — the
 * members record stays the manifest (defs merge, state union, tag stamping via
 * reverse lookup), but routing reads as plain control flow over the graphs.
 */

const fast = defineGraph<{ kind: string }>().field('steps', slider({ min: 1, max: 10, default: 4 }));
const full = defineGraph<{ kind: string }>()
  .field('steps', slider({ min: 10, max: 50, default: 30 }))
  .field('note', textOf({ default: 'full' }));

describe('branch picks that return the member graph', () => {
  it('untagged: routes to the returned graph', () => {
    const hub = branch((ext: { kind: string }) => (ext.kind === 'fast' ? fast : full), {
      fast,
      full,
    });
    const a = hub.parse({}, { kind: 'fast' });
    if (!a.success) throw new Error('unexpected');
    expect((a.state as { steps: number }).steps).toBe(4);
    const b = hub.parse({}, { kind: 'anything-else' });
    if (!b.success) throw new Error('unexpected');
    expect(b.state).toMatchObject({ steps: 30, note: 'full' });
  });

  it('tagged: the stamped key comes from the manifest by reverse lookup', () => {
    const hub = branch('mode', (ext: { kind: string }) => (ext.kind === 'fast' ? fast : full), {
      fast,
      full,
    });
    const result = hub.parse({}, { kind: 'fast' });
    if (!result.success) throw new Error('unexpected');
    expect((result.state as { mode: string }).mode).toBe('fast');
    expect((result.data as { mode: string }).mode).toBe('fast');
  });

  it('a graph that is not in the manifest is a loud error', () => {
    const stranger = defineGraph<{ kind: string }>().field('x', textOf({ default: '' }));
    const hub = branch((_ext: { kind: string }) => stranger as unknown as typeof fast, {
      fast,
      full,
    });
    expect(() => hub.parse({}, { kind: 'fast' })).toThrow(/not one of the members/);
  });

  it('key-returning picks still work unchanged', () => {
    const hub = branch((ext: { kind: string }) => (ext.kind === 'fast' ? 'fast' : 'full'), {
      fast,
      full,
    });
    const result = hub.parse({}, { kind: 'fast' });
    if (!result.success) throw new Error('unexpected');
    expect((result.state as { steps: number }).steps).toBe(4);
  });
});

describe('record-less branch — no manifest at all', () => {
  it('routes purely on the returned graph', () => {
    const hub = branch((ext: { kind: string }) => (ext.kind === 'fast' ? fast : full));
    const a = hub.parse({}, { kind: 'fast' });
    if (!a.success) throw new Error('unexpected');
    expect((a.state as { steps: number }).steps).toBe(4);
    const b = hub.parse({}, { kind: 'other' });
    if (!b.success) throw new Error('unexpected');
    expect(b.state).toMatchObject({ steps: 30, note: 'full' });
  });

  it('the STATE type is the union of the returned graphs', () => {
    type Assert<T extends true> = T;
    type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
      ? true
      : false;
    const hub = branch((ext: { kind: string }) => (ext.kind === 'fast' ? fast : full));
    const result = hub.parse({}, { kind: 'other' });
    if (!result.success) throw new Error('unexpected');
    type State = typeof result.state;
    type _hasNote = Assert<Equals<'note' extends keyof Extract<State, { note: string }> ? true : false, true>>;
    expect((result.state as { note: string }).note).toBe('full');
  });

  it('a member graph mounted record-less still forwards its rules once visited', () => {
    const ruled = defineGraph<{ kind: string }>()
      .field('steps', slider({ min: 1, max: 10, default: 4 }))
      .field('note', textOf({ default: '' }))
      .effect({ steps: () => ({ note: 'stepped' }) });
    const hub = defineGraph<{ kind: string }>().use(
      branch((_ext: { kind: string }) => ruled)
    );
    const store = hub.createStore({ ext: { kind: 'x' } });
    store.set({ steps: 7 });
    expect(store.getField('note')?.value).toBe('stepped');
  });

  it('a non-graph return is a loud error', () => {
    const hub = branch((_ext: { kind: string }) => undefined as unknown as typeof fast);
    expect(() => hub.parse({}, { kind: 'x' })).toThrow(/must return a member graph/);
  });
});
