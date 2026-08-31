import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { codec } from '../codec.js';
import { defineForm } from '../form.js';
import { type Fields } from '../resolve.js';

/**
 * Where v1 needed a runtime circuit breaker (the 1000-iteration guard on its
 * evaluation loop), this design prevents cycles by construction. Each block
 * pins one of those structural guarantees; the last covers the ONE shape that
 * still needs a runtime check (subscriber-driven set() cascades).
 *
 * Not testable because not writable: a field-derivation cycle. "A depends on
 * B" in a resolver means B is a variable declared ABOVE A — referencing it the
 * other way round is a TS error (use before declaration), not a runtime loop.
 */

const NUM = codec<number>({ output: z.number(), default: 0 });
const TEXT = codec<string>({ output: z.string(), default: '' });

describe('rules terminate in one ordered pass', () => {
  it('a mutually-referencing rule pair executes each rule at most once', () => {
    // In v1 this shape is the flux draft pair — two effects that would
    // re-trigger each other forever without their mutual guards. Here the
    // guards are OPTIONAL for termination: each rule runs once, additions
    // reach only later rules, and the pass ends.
    let aRuns = 0;
    let bRuns = 0;
    const pingPong = {
      a: () => {
        aRuns++;
        return { b: 'set-by-a' }; // unconditionally writes b — no guard
      },
      b: () => {
        bRuns++;
        return { a: 'set-by-b' }; // unconditionally writes a back — no guard
      },
    };

    const form = defineForm<void>()({
      resolve: (f: Fields) => ({ a: f.field('a', TEXT), b: f.field('b', TEXT) }),
      reconcile: [pingPong],
    });
    const store = form.createStore({ ext: undefined });

    store.set({ a: 'user' });

    expect(aRuns).toBe(1);
    expect(bRuns).toBe(1); // fired on rule a's addition — once, then the pass ended
    // b's write to `a` lands (it's later in order), overwriting the user value:
    // wrong-but-terminating is the failure mode, never a hang. Real rules guard
    // on state; the engine guarantees only that the pass ENDS.
    expect(store.getState()).toMatchObject({ a: 'set-by-b', b: 'set-by-a' });
  });

  it('an addition cannot re-trigger an EARLIER rule (no rewind)', () => {
    let firstRuns = 0;
    const ordered = {
      target: () => {
        firstRuns++;
        return undefined;
      },
      source: () => ({ target: 'added-late' }),
    };

    const form = defineForm<void>()({
      resolve: (f: Fields) => ({ source: f.field('source', TEXT), target: f.field('target', TEXT) }),
      reconcile: [ordered],
    });
    const store = form.createStore({ ext: undefined });

    store.set({ source: 'go' });

    expect(firstRuns).toBe(0); // 'target' entered the patch AFTER its rule's turn
    expect(store.getState().target).toBe('added-late'); // the addition still lands
  });
});

describe('subscriber-driven set() cascades', () => {
  it('a convergent cascade terminates via the equal-value early-out', () => {
    const form = defineForm<void>()({
      resolve: (f: Fields) => ({ n: f.field('n', NUM) }),
    });
    const store = form.createStore({ ext: undefined });

    let notifications = 0;
    store.subscribe('n', () => {
      notifications++;
      store.set({ n: 5 }); // idempotent write: second call changes nothing
    });

    store.set({ n: 1 });

    expect(store.getState().n).toBe(5);
    expect(notifications).toBe(2); // 1 -> notify -> 5 -> notify -> (5 again: no change, stop)
  });

  it('a divergent cascade is detected and thrown, not hung', () => {
    const form = defineForm<void>()({
      resolve: (f: Fields) => ({ n: f.field('n', NUM) }),
    });
    const store = form.createStore({ ext: undefined });

    store.subscribe('n', () => {
      // Always writes a DIFFERENT value — the unbounded shape.
      store.set({ n: store.getState().n + 1 });
    });

    expect(() => store.set({ n: 1 })).toThrow(/cascade exceeded depth/);
  });
});

describe('resolution cannot re-enter', () => {
  it('the Fields collector exposes no way to write during a pass', () => {
    const form = defineForm<void>()({
      resolve: (f: Fields) => {
        // The collector's surface is field/computed/note — statically, there is
        // no set. Pin it at runtime too, against accidental additions.
        expect('set' in f).toBe(false);
        return { n: f.field('n', NUM) };
      },
    });

    const spy = vi.fn();
    const store = form.createStore({ ext: undefined });
    store.subscribe(spy);
    store.set({ n: 2 });
    expect(spy).toHaveBeenCalledTimes(1); // one resolve, one notify, no re-entry
  });
});
