import { createElement, type ReactElement } from 'react';
import type {
  CodecRegistry,
  FormDefinition,
  FormStore,
  InferCodecMeta,
  InferCodecValue,
} from '../core/index.js';
import { Controller, type ControllerProps, type ControllerRenderProps } from './Controller.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = FormStore<any, any>;

export type TypedController<R extends CodecRegistry> = <K extends keyof R & string>(
  props: TypedControllerProps<R, K>
) => ReactElement | null;

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
 * PREFERRED: pass the form, and the registry comes from its `codecs` slot —
 * nothing separate to export:
 *
 *   const GenController = createTypedController(genForm);
 *   <GenController name="steps" render={({ value, meta }) => ...} />
 *   // value: number, meta: { min: number; max: number; step: number }
 *
 * The zero-arg call with an annotated registry (`createTypedController<typeof
 * codecs>()`) remains for forms defined without a codecs slot. Where a key
 * uses different codecs per branch, register the union — value and meta become
 * the branch union.
 *
 * @typeParam R - The codec registry: INFERRED from the form argument, or
 *   ANNOTATED as `typeof codecs` on the zero-arg call. It is the single source
 *   the returned component derives per-key types from.
 * @typeParam K - (on the returned component) the field name being controlled:
 *   INFERRED from the `name` prop, constrained to `keyof R`, and what narrows
 *   `value`/`meta` in the render props.
 */
export function createTypedController<R extends CodecRegistry>(): TypedController<R>;
export function createTypedController<State, Ext, R extends CodecRegistry>(
  form: FormDefinition<State, Ext, R>
): TypedController<R>;
export function createTypedController<R extends CodecRegistry>(_form?: unknown) {
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
