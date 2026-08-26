import { createSubscriber } from 'svelte/reactivity';
import type {
  CodecRegistry,
  FieldSnapshot,
  FormStore,
  InferCodecMeta,
  InferCodecValue,
} from '../core/index.js';

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
 * Builds an app-typed `field` from a codec registry, so `name` narrows `value`
 * and `meta` with no per-call-site generics — the Svelte counterpart of the
 * React binding's `createTypedController`:
 *
 *   const codecs = { steps: STEPS, aspectRatio: ASPECT };
 *   const typedField = createTypedField<typeof codecs>();
 *   const steps = typedField(store, 'steps');
 *   // steps.current: FieldSnapshot<number, SliderMeta> | null
 *
 * Where a key uses different codecs per branch, register the union — value and
 * meta become the branch union.
 *
 * @typeParam R - The app's codec-registry literal, ANNOTATED as
 *   `typeof codecs` at the create site. It is the single source the returned
 *   function derives per-key types from.
 * @typeParam K - (on the returned function) the field name: INFERRED from the
 *   `name` argument, constrained to `keyof R`, and what narrows the snapshot's
 *   `value`/`meta`.
 */
export function createTypedField<R extends CodecRegistry>() {
  return function typedField<K extends keyof R & string>(
    store: AnyStore,
    name: K
  ): Reactive<FieldSnapshot<InferCodecValue<R[K]>, InferCodecMeta<R[K]>> | null> {
    return field<InferCodecValue<R[K]>, InferCodecMeta<R[K]>>(store, name);
  };
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
