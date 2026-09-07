import { createContext, useContext } from 'react';

/**
 * The dotted path prefix of the enclosing <ListElement> ('' at the root).
 * useField, Controller and useList consume it, which is what makes every
 * existing hook and control work unchanged inside an element: `name="engine"`
 * under `<ListElement list="runs" id="a1b2">` resolves `runs[a1b2].engine`.
 * Lives in its own module so list.ts and useField.ts share it without a cycle.
 */
export const ElementPrefixContext = createContext('');

export function useElementPrefix(): string {
  return useContext(ElementPrefixContext);
}
