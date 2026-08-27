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

/**
 * The batteries-included web-storage adapter: JSON (de)serialization over
 * localStorage (or sessionStorage), writes debounced off the keystroke path,
 * and a synchronous flush wired to pagehide/visibilitychange so a closing tab
 * cannot lose the last change.
 *
 * Returns undefined outside a browser (SSR) — StoreOptions.storage accepts
 * that directly:
 *
 *   const store = form.createStore({ ext, storage: persistedStorage('my-form') });
 *
 * The flush listeners live for the page's lifetime, sized for the common case
 * of one store per page; call the returned adapter's dispose() if a store is
 * torn down early.
 */
export function persistedStorage(
  key: string,
  options?: { session?: boolean; delayMs?: number }
): (DebouncedStorageAdapter & { dispose(): void }) | undefined {
  if (typeof window === 'undefined') return undefined;
  const backend = options?.session ? window.sessionStorage : window.localStorage;
  const inner: StorageAdapter = {
    load: () => {
      try {
        return JSON.parse(backend.getItem(key) ?? 'null') ?? undefined;
      } catch {
        return undefined;
      }
    },
    save: (intent) => {
      try {
        backend.setItem(key, JSON.stringify(intent));
      } catch {
        // Quota/privacy-mode failures degrade to in-memory-only — the store
        // itself keeps working.
      }
    },
  };
  const adapter = debouncedStorage(inner, options?.delayMs ?? 300);
  const flush = () => adapter.flush();
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') adapter.flush();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibility);
  return {
    ...adapter,
    dispose() {
      adapter.flush();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
