import { useCallback, useRef, useSyncExternalStore, type ReactElement } from 'react';
import type { FieldError, FormStore, InferDefMeta, InferDefValue } from '../core/index.js';
import type { CodecRegistry } from '../core/codec.js';
import { useOptionalFormStore } from './context.js';
import { useField } from './useField.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = FormStore<any, any>;

export interface ControllerRenderProps<Value, Meta> {
  value: Value;
  meta: Meta;
  error: FieldError | undefined;
  onChange: (next: Value) => void;
  isComputed: boolean;
}

export interface ControllerProps<Value, Meta> {
  name: string;
  render: (props: ControllerRenderProps<Value, Meta>) => ReactElement | null;
  /** Defaults to the store from <FormProvider>. */
  store?: AnyStore;
}

/** The registry a graph definition's stores carry — what `graph`-prop calls type from. */
type RegistryOfGraph<G> = G extends {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createStore(...args: any[]): FormStore<any, any, infer R>;
}
  ? R
  : never;

/** The graph's state type — where COMPUTEDS and branch TAGS live. */
type StateOfGraph<G> = G extends {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createStore(...args: any[]): FormStore<infer S, any, any>;
}
  ? S
  : never;

type StateKeys<G> = StateOfGraph<G> extends infer S
  ? S extends unknown
    ? keyof S & string
    : never
  : never;

/** Every name a graph can resolve: its defs plus its computeds/tags. */
type GraphFieldName<G> = (keyof RegistryOfGraph<G> & string) | StateKeys<G>;

/**
 * A name's value type: from the registry when it's a def; otherwise from the
 * state union (computeds, branch tags), `| undefined` where an arm lacks it.
 */
type GraphFieldValue<G, K> = K extends keyof RegistryOfGraph<G>
  ? InferDefValue<RegistryOfGraph<G>[K]>
  : StateOfGraph<G> extends infer S
    ? S extends unknown
      ? K extends keyof S
        ? S[K]
        : undefined
      : never
    : never;

type GraphFieldMeta<G, K> = K extends keyof RegistryOfGraph<G>
  ? InferDefMeta<RegistryOfGraph<G>[K]>
  : undefined;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGraph = { createStore(...args: any[]): unknown };

export interface GraphControllerProps<G extends AnyGraph, K extends GraphFieldName<G>> {
  /**
   * TYPE-ONLY: the graph definition whose registry constrains `name` and
   * types `value`/`meta` — the live store still comes from <FormProvider>
   * (or the `store` prop). Pass the graph whose fields this control belongs
   * to; a hub-mounted section graph works because field names are shared.
   * Computeds and branch tags resolve through the state type (meta undefined).
   */
  graph: G;
  name: K;
  render: (
    props: ControllerRenderProps<GraphFieldValue<G, K>, GraphFieldMeta<G, K>>
  ) => ReactElement | null;
  store?: AnyStore;
}

/**
 * Subscribe to one field, render nothing when
 * the field is inactive in the current branch.
 *
 * The `graph` form types `value`/`meta` from the graph's own registry:
 *
 *   <Controller graph={imageHub} name="cfgScale" render={({ value, meta }) => ...} />
 */
export function Controller<G extends AnyGraph, K extends GraphFieldName<G>>(
  props: GraphControllerProps<G, K>
): ReactElement | null;
export function Controller<Value = unknown, Meta = unknown>(
  props: ControllerProps<Value, Meta>
): ReactElement | null;
export function Controller<Value = unknown, Meta = unknown>({
  name,
  render,
  store: storeProp,
}: ControllerProps<Value, Meta>): ReactElement | null {
  const contextStore = useOptionalFormStore();
  const store = storeProp ?? contextStore;

  const field = useField<Value, Meta>(store, name);
  const onChange = useCallback((next: Value) => store?.set({ [name]: next }), [store, name]);

  if (!store) throw new Error('<Controller> needs a `store` prop or a <FormProvider>');
  if (!field) return null;

  return render({
    value: field.value,
    meta: field.meta as Meta,
    error: field.error,
    onChange,
    isComputed: field.isComputed,
  });
}

export interface MultiControllerProps<
  G extends AnyGraph,
  Ks extends readonly GraphFieldName<G>[],
> {
  graph: G;
  names: Ks;
  render: (props: {
    values: { [K in Ks[number]]: GraphFieldValue<G, K> | undefined };
  }) => ReactElement | null;
  store?: AnyStore;
}

/**
 * Subscribe to SEVERAL fields at once — for renders that need values across
 * fields (alerts over model+resources+vae). Inactive fields read undefined.
 */
export function MultiController<
  G extends AnyGraph,
  const Ks extends readonly GraphFieldName<G>[],
>({ names, render, store: storeProp }: MultiControllerProps<G, Ks>): ReactElement | null {
  const contextStore = useOptionalFormStore();
  const store = storeProp ?? contextStore;
  // one subscription for the set; per-field reference stability keeps this cheap
  const values = useMultiFieldValues(store, names as readonly string[]);
  if (!store) throw new Error('<MultiController> needs a `store` prop or a <FormProvider>');
  return render({ values: values as never });
}

function useMultiFieldValues(store: AnyStore | null, names: readonly string[]) {
  const subscribe = useCallback(
    (cb: () => void) => (store ? store.subscribe(cb) : () => undefined),
    [store]
  );
  // Field snapshots are reference-stable for unchanged fields (diffSnapshot),
  // so comparing the snapshot references decides identity — no serialization.
  const cacheRef = useRef<{ fields: readonly unknown[]; value: Record<string, unknown> }>({
    fields: [],
    value: {},
  });
  const getSnapshot = useCallback(() => {
    const fields = names.map((name) => store?.getField(name));
    const prev = cacheRef.current.fields;
    const unchanged =
      prev.length === fields.length && fields.every((snap, i) => snap === prev[i]);
    if (!unchanged) {
      const value: Record<string, unknown> = {};
      names.forEach((name, i) => {
        value[name] = (fields[i] as { value?: unknown } | null | undefined)?.value;
      });
      cacheRef.current = { fields, value };
    }
    return cacheRef.current.value;
  }, [store, names]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
