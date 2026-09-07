import { createElement, useMemo, type ReactElement, type ReactNode } from 'react';
import { elementPrefix, type FormStore, type ListHandle, type ListSnapshot } from '../core/index.js';
import { useOptionalFormStore } from './context.js';
import { ElementPrefixContext, useElementPrefix } from './elementPrefix.js';
import { useField } from './useField.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = FormStore<any, any, any, any>;

/**
 * Fixes the element path for everything rendered inside: hooks and
 * Controllers keep their bare member names and subscribe per-element.
 * Nests — an inner list's path builds on the enclosing element's.
 */
export function ListElement({
  list,
  id,
  children,
}: {
  list: string;
  id: string;
  children: ReactNode;
}): ReactElement {
  const parent = useElementPrefix();
  return createElement(ElementPrefixContext.Provider, { value: elementPrefix(parent + list, id) }, children);
}

/**
 * The list handle for React: subscribes to the MEMBERSHIP entry only — the
 * shell re-renders on add/remove/reorder and never on an element edit (the
 * render-isolation contract, pinned in list-isolation.test.tsx). Row
 * components key on the ids and subscribe per-element via <ListElement>.
 * Returns null while the list is inactive in the current branch.
 */
export function useList(key: string, storeProp?: AnyStore): ListSnapshot | null {
  const contextStore = useOptionalFormStore();
  const store = storeProp ?? contextStore;
  const prefix = useElementPrefix();
  const fullKey = prefix + key;

  // the membership field IS the subscription — useField applies the prefix itself
  const membership = useField<readonly string[]>(store, key);

  const ops = useMemo<Pick<ListHandle, 'add' | 'remove' | 'duplicate' | 'move'>>(() => {
    // A click can land after a branch switch deactivated the list; an event
    // handler deserves the API's refusal shape, not an exception.
    const safely = <T>(op: () => T): T | { success: false; reason: 'inactive' } => {
      try {
        return op();
      } catch {
        return { success: false, reason: 'inactive' };
      }
    };
    return {
      add: (seed) => safely(() => store!.list(fullKey).add(seed)),
      remove: (id) => safely(() => store!.list(fullKey).remove(id)),
      duplicate: (id) => safely(() => store!.list(fullKey).duplicate(id)),
      move: (id, index) => safely(() => store!.list(fullKey).move(id, index)),
    };
  }, [store, fullKey]);
  const result = useMemo(
    () => (membership ? { ids: membership.value, ...ops } : null),
    [membership, ops]
  );

  if (!store) throw new Error('useList needs a `store` argument or a <FormProvider>');
  return result;
}
