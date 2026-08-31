import { createSubscriber } from 'svelte/reactivity';
import type { FieldSnapshot, FormStore, InferDefMeta, InferDefValue } from '../core/index.js';
import type { CodecRegistry } from '../core/codec.js';

/**
 * Svelte 5 binding. Same contract as the React one, expressed in Svelte's
 * idiom: each helper returns an object whose `current` getter is reactive —
 * reading it inside an effect or template subscribes, and the subscription
 * fires only when the underlying reference changes (per-key for `field`,
 * whole-snapshot for `formState`). All semantics live in FormStore; this file
 * is only the bridge into Svelte's reactivity, and must stay that thin.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = FormStore<any, any>;

export interface Reactive<T> {
  readonly current: T;
}

/**
 * Subscribes to one field. `current` is null when the field is not active in
 * the current branch. Reference-preserving diffing means a full recompute
 * only wakes the controls whose data actually moved — the same render
 * isolation the React binding gets from useSyncExternalStore.
 */
export function field<Value = unknown, Meta = unknown>(
  store: AnyStore,
  name: string
): Reactive<FieldSnapshot<Value, Meta> | null> {
  const subscribe = createSubscriber((update) => store.subscribe(name, update));
  return {
    get current() {
      subscribe();
      return store.getField(name) as FieldSnapshot<Value, Meta> | null;
    },
  };
}

/**
 * Every key of a codec registry mapped to its typed reactive field handle.
 *
 * @typeParam Codecs - The registry carried on the store, from the form's
 *   `codecs` slot.
 */
export type FieldsOf<Codecs> = {
  readonly [K in keyof Codecs & string]: Reactive<FieldSnapshot<
    InferDefValue<Codecs[K]>,
    InferDefMeta<Codecs[K]>
  > | null>;
};

/**
 * Typed field handles derived FROM THE FORM — no separate registry to declare
 * or import. The form's `codecs` slot is the single source; the store carries
 * its type; this reads it back:
 *
 *   const form = defineForm({ defs: { steps: STEPS, ... }, resolve });
 *   const f = typedFields(form.createStore({ ext }));
 *   f.steps.current   // FieldSnapshot<number, NumberMeta> | null
 *
 * Handles are created lazily per key and cached, so `f.steps` is stable and
 * subscribing costs nothing until a handle is actually read in an effect.
 * `current` is null while the key is inactive in the current branch — the form
 * decides what exists; the page just places controls.
 *
 * @typeParam State - The store's state union (inferred, unused here).
 * @typeParam Ext - The store's external-context type (inferred, unused here).
 * @typeParam Codecs - The registry to derive per-key value/meta types from:
 *   INFERRED from the store argument, which carries it from the form.
 */
export function typedFields<State, Ext, Codecs extends CodecRegistry>(
  store: FormStore<State, Ext, Codecs>
): FieldsOf<Codecs> {
  const cache = new Map<string, Reactive<FieldSnapshot<unknown, unknown> | null>>();
  return new Proxy({} as FieldsOf<Codecs>, {
    get: (_target, key) => {
      if (typeof key !== 'string') return undefined;
      let handle = cache.get(key);
      if (!handle) {
        handle = field(store as AnyStore, key);
        cache.set(key, handle);
      }
      return handle;
    },
  });
}

/** Subscribes to the whole state. Wakes on any change — prefer `field` for controls. */
export function formState<State, Ext = unknown>(store: FormStore<State, Ext>): Reactive<State> {
  const subscribe = createSubscriber((update) => store.subscribe(update));
  return {
    get current() {
      subscribe();
      return store.getSnapshot().state;
    },
  };
}

export { default as Field } from './Field.svelte';
