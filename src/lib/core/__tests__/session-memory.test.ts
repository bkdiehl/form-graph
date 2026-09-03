import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineGraph } from '../graph.js';

/**
 * Adopted defaults: the session remembers what the form showed. A field that
 * fell through to its default keeps that value across sibling changes exactly
 * like a user choice (the flapping-default fix), while storage saves stay
 * user-writes-only and a fresh session re-derives today's defaults.
 */

const TEXT = { input: z.string().optional(), output: z.string(), default: '' };

// `category`'s default depends on `mode` — the exact shape that flapped.
const graph = defineGraph<{ tier?: string }>()
  .field('mode', { input: z.string().optional(), output: z.string(), default: 'a' })
  .field('category', ({ mode, _ext }) => ({
    input: z.string().optional(),
    output: z.string(),
    default: `${mode}-default${_ext.tier ? `-${_ext.tier}` : ''}`,
  }))
  .field('steps', ({ mode }) => ({
    input: z.coerce.number().optional(),
    output: z.number(),
    default: mode === 'a' ? 10 : 50,
    // per-bucket memory: each mode's steps live at their own address
    scope: mode,
  }))
  .field('note', TEXT);

const state = (store: { getSnapshot(): { state: unknown } }) =>
  store.getSnapshot().state as { mode: string; category: string; steps: number };

describe('adopted defaults (session memory)', () => {
  it('a displayed default survives a sibling change, like a user choice', () => {
    const store = graph.createStore({ ext: {} });
    expect(state(store).category).toBe('a-default');
    store.set({ mode: 'b' });
    expect(state(store).category).toBe('a-default'); // sticky — no flap
  });

  it('per-address adoption keeps per-bucket defaults independent', () => {
    const store = graph.createStore({ ext: {} });
    expect(state(store).steps).toBe(10);
    store.set({ mode: 'b' });
    expect(state(store).steps).toBe(50); // different bucket -> fresh default
    store.set({ mode: 'a' });
    expect(state(store).steps).toBe(10);
  });

  it('storage saves stay user-writes-only', () => {
    const save = vi.fn();
    const store = graph.createStore({ ext: {}, storage: { load: () => undefined, save } });
    store.set({ note: 'hello' });
    const saved = save.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(saved).toEqual({ note: 'hello' }); // no adopted category/steps/mode
  });

  it('a fresh session re-derives today\'s defaults (nothing resurrects)', () => {
    const backing: { record?: Record<string, unknown> } = {};
    const storage = {
      load: () => backing.record,
      save: (r: Record<string, unknown>) => void (backing.record = r),
    };
    const first = graph.createStore({ ext: {}, storage });
    first.set({ mode: 'b' });
    expect(state(first).category).toBe('a-default'); // adopted, displayed
    // "reload": new store, same storage — mode persisted, category was never
    const second = graph.createStore({ ext: {}, storage });
    expect(state(second).mode).toBe('b');
    expect(state(second).category).toBe('b-default'); // re-derived fresh
  });

  it('a sessionMemory Map carries adoption across a remount', () => {
    const memory = new Map<string, unknown>();
    const first = graph.createStore({ ext: {}, sessionMemory: memory });
    expect(state(first).category).toBe('a-default');
    first.set({ mode: 'b' });
    // remount: new store, same Map, no storage
    const second = graph.createStore({ ext: {}, sessionMemory: memory });
    expect(state(second).category).toBe('a-default'); // still what the session showed
  });

  it('a user write replaces the adopted default and evicts it from the Map', () => {
    const memory = new Map<string, unknown>();
    const save = vi.fn();
    const store = graph.createStore({
      ext: {},
      sessionMemory: memory,
      storage: { load: () => undefined, save },
    });
    expect(memory.get('category')).toBe('a-default');
    store.set({ category: 'chosen' });
    expect(memory.has('category')).toBe(false);
    expect((save.mock.calls.at(-1)![0] as Record<string, unknown>).category).toBe('chosen');
    store.set({ mode: 'b' });
    expect(state(store).category).toBe('chosen'); // durable choice still wins
  });

  it('setExt evicts adopted defaults so late-hydrating ext is not frozen out', () => {
    const store = graph.createStore({ ext: {} });
    expect(state(store).category).toBe('a-default');
    store.setExt({ tier: 'gold' });
    expect(state(store).category).toBe('a-default-gold'); // re-derived, not stale
  });

  it('reset clears adopted defaults and re-adopts fresh', () => {
    const store = graph.createStore({ ext: {} });
    store.set({ mode: 'b' });
    expect(state(store).category).toBe('a-default');
    store.reset();
    expect(state(store).mode).toBe('a');
    expect(state(store).category).toBe('a-default');
  });
});
