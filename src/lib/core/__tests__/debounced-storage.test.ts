import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debouncedStorage, type StorageAdapter } from '../index.js';
import { defaultExt, miniForm } from '../../__fixtures__/mini-generation.js';

describe('debouncedStorage', () => {
  let writes: Record<string, unknown>[] = [];
  const inner: StorageAdapter = {
    load: () => ({ prompt: 'stored' }),
    save: (intent) => {
      writes.push(intent);
    },
  };

  beforeEach(() => {
    writes = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('collapses a typing burst into one trailing write with the latest data', () => {
    const store = miniForm.createStore({ ext: defaultExt, storage: debouncedStorage(inner, 300) });

    for (const text of ['a', 'a c', 'a ca', 'a cat']) store.set({ prompt: text });
    expect(writes).toHaveLength(0);

    vi.advanceTimersByTime(300);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ prompt: 'a cat' });
  });

  it('keeps writing during continuous typing (throttle, not pure debounce)', () => {
    const store = miniForm.createStore({ ext: defaultExt, storage: debouncedStorage(inner, 300) });

    // Type continuously for 1s — a pure debounce would write nothing.
    for (let i = 0; i < 10; i++) {
      store.set({ prompt: `text ${i}` });
      vi.advanceTimersByTime(100);
    }

    expect(writes.length).toBeGreaterThanOrEqual(3);
  });

  it('flush() writes pending data immediately (the pagehide hook)', () => {
    const adapter = debouncedStorage(inner, 300);
    const store = miniForm.createStore({ ext: defaultExt, storage: adapter });

    store.set({ prompt: 'a cat' });
    adapter.flush();

    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ prompt: 'a cat' });

    // The scheduled timer must not double-write after a flush.
    vi.advanceTimersByTime(300);
    expect(writes).toHaveLength(1);
  });

  it('flush() with nothing pending is a no-op', () => {
    const adapter = debouncedStorage(inner, 300);
    adapter.flush();
    expect(writes).toHaveLength(0);
  });

  it('passes load through untouched', () => {
    const store = miniForm.createStore({ ext: defaultExt, storage: debouncedStorage(inner, 300) });
    expect(store.getField('prompt')?.value).toBe('stored');
  });
});

describe('no-change saves are skipped', () => {
  it('does not serialize or save when a set() changes nothing', () => {
    const writes: unknown[] = [];
    const store = miniForm.createStore({
      ext: defaultExt,
      storage: { load: () => ({}), save: (intent) => writes.push(intent) },
    });

    store.set({ prompt: 'a cat' });
    expect(writes).toHaveLength(1);

    store.set({ prompt: 'a cat' }); // same value — nothing changed
    expect(writes).toHaveLength(1);
  });
});
