import { createElement, type ReactElement } from 'react';
import type { CodecRegistry, FormStore, InferCodecMeta, InferCodecValue } from '../core/index.js';
import { Controller, type ControllerProps, type ControllerRenderProps } from './Controller.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = FormStore<any, any>;

export interface TypedControllerProps<R extends CodecRegistry, K extends keyof R & string> {
  name: K;
  render: (
    props: ControllerRenderProps<InferCodecValue<R[K]>, InferCodecMeta<R[K]>>
  ) => ReactElement | null;
  store?: AnyStore;
}

/**
 * Builds an app-typed Controller from a codec registry, so `name` narrows
 * `value` and `meta` with no per-call-site generics:
 *
 *   const genCodecs = { steps: STEPS, aspectRatio: ASPECT, ... };
 *   const GenController = createTypedController<typeof genCodecs>();
 *   <GenController name="steps" render={({ value, meta }) => ...} />
 *   // value: number, meta: { min: number; max: number; step: number }
 *
 * Where a key uses different codecs per branch, register the union — value and
 * meta become the branch union, exactly like v1's CtxValues/CtxMeta lookups.
 *
 * @typeParam R - The app's codec-registry literal, ANNOTATED as
 *   `typeof genCodecs` at the create site. It is the single source the
 *   returned component derives per-key types from.
 * @typeParam K - (on the returned component) the field name being controlled:
 *   INFERRED from the `name` prop, constrained to `keyof R`, and what narrows
 *   `value`/`meta` in the render props.
 */
export function createTypedController<R extends CodecRegistry>() {
  return function TypedController<K extends keyof R & string>({
    name,
    render,
    store,
  }: TypedControllerProps<R, K>): ReactElement | null {
    return createElement(
      Controller as (
        props: ControllerProps<InferCodecValue<R[K]>, InferCodecMeta<R[K]>>
      ) => ReactElement | null,
      { name, render, store }
    );
  };
}
