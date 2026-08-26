import { useCallback, useSyncExternalStore } from 'react';
import type { FieldSnapshot, FormStore } from '../core/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = FormStore<any, any>;

/**
 * Subscribes to one field. Returns null when the field is not active in the
 * current branch.
 *
 * The subscription only fires when the field's snapshot *reference* changes, and
 * `diffSnapshot` preserves that reference for structurally-unchanged fields — so
 * a full recompute re-renders only the controls whose data actually moved.
 */
export function useField<Value = unknown, Meta = unknown>(
  store: AnyStore | null,
  name: string
): FieldSnapshot<Value, Meta> | null {
  const subscribe = useCallback(
    (cb: () => void) => (store ? store.subscribe(name, cb) : () => undefined),
    [store, name]
  );
  const getSnapshot = useCallback(
    () => (store ? (store.getField(name) as FieldSnapshot<Value, Meta> | null) : null),
    [store, name]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
