import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { FormDefinition, FormStore, StoreOptions } from '../core/index.js';
import { deepEqual } from '../core/deep-equal.js';

/**
 * Creates (once) and returns a store for a form definition.
 *
 * The store is stable across renders; `ext` is pushed in only when it actually
 * differs, so callers can pass a fresh object literal every render.
 */
export function useForm<State, Ext>(
  definition: FormDefinition<State, Ext>,
  options: StoreOptions<Ext>
): FormStore<State, Ext> {
  const storeRef = useRef<FormStore<State, Ext> | null>(null);
  if (!storeRef.current) storeRef.current = definition.createStore(options);
  const store = storeRef.current;

  const extRef = useRef(options.ext);
  useEffect(() => {
    if (!deepEqual(extRef.current, options.ext)) {
      extRef.current = options.ext;
      store.setExt(options.ext);
    }
  }, [store, options.ext]);

  return store;
}

/**
 * Subscribes to the whole snapshot. Re-renders on any change — prefer
 * `useField` for controls.
 */
export function useFormState<State>(store: FormStore<State, unknown>): State {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot().state,
    () => store.getSnapshot().state
  );
}
