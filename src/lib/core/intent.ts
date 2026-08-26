import { runSchema } from './run-schema.js';
import type { Codec, FieldError, SchemaIssue, SchemaLike } from './types.js';

/**
 * One user-expressed value.
 *
 * `trusted` records where it came from, which is what decides whether the input
 * schema runs: UI writes are typed at the call site and stored verbatim, while
 * boundary values (storage, remix, URL, raw server input) are parsed lazily on
 * first read. Entries are immutable, so their object identity doubles as the
 * parse-cache key — each boundary value is parsed exactly once, ever.
 */
export interface IntentEntry {
  readonly value: unknown;
  readonly trusted: boolean;
}

/**
 * Everything the user has ever set, keyed by intent ADDRESS — the bare field key
 * for unscoped fields, `key@scope` for scoped ones (see scope.ts). Never pruned
 * when a branch deactivates — which is what makes branch memory (Flux -> SD ->
 * Flux restores your Flux values) fall out of the data model instead of a
 * storage adapter, and scoped addresses are what let one KEY hold several
 * per-branch values at once.
 */
export type Intent = ReadonlyMap<string, IntentEntry>;

/**
 * Values that arrived by KEY and haven't been filed at an address yet — a
 * `set()` patch or boundary defaults. The resolver consumes them by key (they
 * win over stored intent for that pass); the store then commits each one at the
 * address the field actually resolved with, which is how a remix value for a
 * scoped field lands in the right bucket without the caller knowing scopes
 * exist.
 */
export type PendingValues = ReadonlyMap<string, IntentEntry>;

export const trustedEntry = (value: unknown): IntentEntry => ({ value, trusted: true });
export const boundaryEntry = (value: unknown): IntentEntry => ({ value, trusted: false });

export function intentFromRaw(raw: Record<string, unknown> | undefined): Map<string, IntentEntry> {
  const intent = new Map<string, IntentEntry>();
  if (!raw) return intent;
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined) intent.set(key, boundaryEntry(value));
  }
  return intent;
}

/** Memoises boundary parsing by entry identity. */
export type ParseCache = WeakMap<IntentEntry, ParsedEntry>;

export interface ParsedEntry {
  value: unknown;
  error: FieldError | undefined;
}

export function readEntry(
  entry: IntentEntry,
  codec: Codec<unknown, unknown> | undefined,
  cache: ParseCache
): ParsedEntry {
  if (entry.trusted) return { value: entry.value, error: undefined };

  const cached = cache.get(entry);
  if (cached) return cached;

  const schema: SchemaLike<unknown> | undefined = codec?.input ?? codec?.output;
  let parsed: ParsedEntry;

  if (!schema) {
    parsed = { value: entry.value, error: undefined };
  } else {
    const result = runSchema(schema, entry.value);
    parsed = result.success
      ? { value: result.data, error: undefined }
      : // Lenient by design: the caller falls back to the default. The error is
        // recorded rather than swallowed so a bad stored value is observable.
        { value: undefined, error: toFieldError(result.error.issues) };
  }

  cache.set(entry, parsed);
  return parsed;
}

export function toFieldError(issues: ReadonlyArray<SchemaIssue>): FieldError {
  const first = issues[0];
  return {
    message: first?.message ?? 'Invalid value',
    code: first?.code ?? 'invalid',
    issues: issues.length > 0 ? issues : [{ message: 'Invalid value', code: 'invalid' }],
  };
}
