import { useCallback, type ReactElement } from 'react';
import type { FieldError, FormStore } from '../core/index.js';
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

/**
 * Subscribe to one field, render nothing when
 * the field is inactive in the current branch.
 */
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
