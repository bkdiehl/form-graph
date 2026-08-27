import { useCallback, useSyncExternalStore } from 'react';
import type {
  CodecRegistry,
  FieldSnapshot,
  FormStore,
  InferCodecMeta,
  InferCodecValue,
} from '../core/index.js';

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

/**
 * useField with value/meta types derived FROM THE FORM — the hook twin of the
 * Svelte binding's typedFields. The store carries the registry type from the
 * form's codecs slot; name narrows the snapshot with no call-site generics.
 */
export function useTypedField<State, Ext, R extends CodecRegistry, K extends keyof R & string>(
  store: FormStore<State, Ext, R> | null,
  name: K
): FieldSnapshot<InferCodecValue<R[K]>, InferCodecMeta<R[K]>> | null {
  return useField<InferCodecValue<R[K]>, InferCodecMeta<R[K]>>(store as AnyStore | null, name);
}
