import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { FormStore } from '../core/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = FormStore<any, any>;

const FormContext = createContext<AnyStore | null>(null);

/**
 * The context value is the store handle, which never changes identity — so a
 * value change never re-renders the subtree. Only leaf subscriptions fire.
 */
export function FormProvider({ store, children }: { store: AnyStore; children: ReactNode }) {
  return createElement(FormContext.Provider, { value: store }, children);
}

export function useFormStore<State = unknown, Ext = unknown>(): FormStore<State, Ext> {
  const store = useContext(FormContext);
  if (!store) throw new Error('useFormStore must be used within a <FormProvider>');
  return store as FormStore<State, Ext>;
}

/** Null instead of throwing, for components that accept a `store` prop as well. */
export function useOptionalFormStore(): AnyStore | null {
  return useContext(FormContext);
}
