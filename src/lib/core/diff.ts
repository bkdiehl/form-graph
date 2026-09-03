import { deepEqual } from './deep-equal.js';
import type { Resolution } from './resolve.js';
import type { FieldError, FieldSnapshot, Snapshot } from './types.js';

/**
 * Turns a fresh resolution into the next snapshot, reusing the previous object
 * for every field that is structurally unchanged.
 *
 * This is the whole render-isolation story: a full recompute produces all-new
 * objects, and this pass canonicalises the unchanged ones back to their previous
 * references so their `useSyncExternalStore` subscribers never fire.
 */
export function diffSnapshot<State>(
  prev: Snapshot<State> | null,
  next: Resolution<State>,
  errors: ReadonlyMap<string, FieldError>
): { snapshot: Snapshot<State>; changed: Set<string> } {
  const changed = new Set<string>();
  const fields = new Map<string, FieldSnapshot>();

  for (const key of next.keys) {
    const record = next.records.get(key)!;
    const candidate: FieldSnapshot = {
      key,
      value: record.value,
      meta: record.meta,
      // Refine failures are NOT live: like the output schema they narrow,
      // they surface through validate()/parse — a pristine required field
      // must not scold before a submit attempt.
      error: errors.get(key) ?? record.boundaryError,
      note: record.note,
      isComputed: record.isComputed,
    };

    const previous = prev?.fields.get(key);
    if (previous && fieldsEqual(previous, candidate)) {
      fields.set(key, previous);
    } else {
      fields.set(key, candidate);
      changed.add(key);
    }
  }

  if (prev) {
    for (const key of prev.fields.keys()) {
      if (!fields.has(key)) changed.add(key);
    }
  }

  if (prev && changed.size === 0) {
    return { snapshot: prev, changed };
  }

  // Reuse the previous key array when the active set is unchanged. Without this,
  // anything rendering the field list (an auto-rendered form, a section index)
  // re-renders on every keystroke and takes its children with it — which defeats
  // per-field isolation from above, no matter how well the fields themselves diff.
  const keys = prev && sameKeys(prev.keys, next.keys) ? prev.keys : next.keys;

  return { snapshot: { state: next.state, fields, keys }, changed };
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function fieldsEqual(a: FieldSnapshot, b: FieldSnapshot): boolean {
  return (
    a.isComputed === b.isComputed &&
    deepEqual(a.value, b.value) &&
    deepEqual(a.meta, b.meta) &&
    deepEqual(a.error, b.error) &&
    deepEqual(a.note, b.note)
  );
}
