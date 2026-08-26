import type { StorageAdapter } from './store.js';

export interface DebouncedStorageAdapter extends StorageAdapter {
  /** Write any pending save immediately (call on pagehide/visibilitychange). */
  flush(): void;
}

/**
 * Defers an adapter's writes off the keystroke path.
 *
 * `save()` is called synchronously by the store on every change; serialization
 * plus a synchronous backend write (localStorage) is the one genuinely
 * expensive thing there. This wrapper keeps only the latest intent and writes
 * it at most once per `delayMs` (trailing, always the latest data) — a typing
 * burst costs one write instead of one per keystroke, and unlike a pure
 * debounce, continuous typing cannot postpone the write forever.
 *
 * The store hands `save` a fresh plain-object snapshot each time, so keeping a
 * reference is safe. `load` passes through untouched.
 *
 * Loss window: a hard kill (crash, OOM) inside `delayMs` loses that window's
 * changes. Wire `flush()` to `pagehide`/`visibilitychange: hidden` — tab
 * closes and navigations then flush synchronously, which is the same guarantee
 * immediate writes give in practice.
 */
export function debouncedStorage(inner: StorageAdapter, delayMs = 300): DebouncedStorageAdapter {
  let pending: Record<string, unknown> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pending !== undefined) {
      const intent = pending;
      pending = undefined;
      inner.save(intent);
    }
  };

  return {
    load: () => inner.load(),
    save: (intent) => {
      pending = intent;
      if (timer === undefined) {
        timer = setTimeout(() => {
          timer = undefined;
          flush();
        }, delayMs);
      }
    },
    flush,
  };
}
