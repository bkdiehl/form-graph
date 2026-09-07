import type { AnyFormStore } from './store.js';

/**
 * Focuses the first errored field, in DECLARATION order (`snapshot.keys`),
 * by the `data-fg-field` attribute the bindings' `fieldProps` render — call
 * it after a failed `validate()`, when refine errors are surfaced:
 *
 *   const result = store.validate(step.keys);
 *   if (!result.success) focusFirstError(store, step.keys);
 *
 * `keys` limits the search to a scope (a wizard step); a LIST key covers its
 * elements, mirroring scoped validate. SSR-safe and never throws: no
 * document, or nothing focusable for any errored key, is `false`. An errored
 * key whose element is missing OR not actually focusable (spread onto a div)
 * doesn't stop the search — a later errored field may be the one on screen.
 */
export function focusFirstError(store: AnyFormStore, keys?: readonly string[]): boolean {
  if (typeof document === 'undefined') return false;
  const scope = keys ? new Set(keys) : undefined;
  const inScope = (key: string): boolean => {
    if (!scope) return true;
    if (scope.has(key)) return true;
    for (const k of scope) if (key.startsWith(k + '[')) return true;
    return false;
  };

  const snapshot = store.getSnapshot();
  for (const key of snapshot.keys) {
    if (!snapshot.fields.get(key)?.error || !inScope(key)) continue;
    // inside a double-quoted attribute selector only " and \ need escaping —
    // CSS.escape (identifier-grade) would be over-machinery here
    const escaped = key.replace(/["\\]/g, '\\$&');
    const element = document.querySelector<HTMLElement>(`[data-fg-field="${escaped}"]`);
    if (!element) continue;
    element.focus();
    if (document.activeElement === element) return true;
  }
  return false;
}
