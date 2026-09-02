/**
 * Scoped intent addresses.
 *
 * A field may declare `scope` at its call site — the values are computed by the
 * resolver (a discriminant, an id, a toggle), and they become part of the address
 * its intent entry is stored under. `steps` scoped by a group key lives at
 * `steps@groupA` and `steps@groupB` simultaneously, which is the whole branch-memory
 * and scoped-persistence mechanism (see docs/data-graph-rethink.md, "Storage").
 */

export type ScopeValue = string | number | boolean;

/**
 * An ABSOLUTE scope — the escape hatch out of scope inheritance. Plain scope
 * values APPEND to the path accumulated down the mount tree; a RootScope sets
 * the path from the root instead. `rootScope()` with no parts detaches the
 * field entirely (bare key — global memory).
 */
export type RootScope = { readonly __scopeRoot: true; readonly parts: readonly ScopeValue[] };

export function rootScope(...parts: readonly ScopeValue[]): RootScope {
  return { __scopeRoot: true, parts };
}

export function isRootScope(scope: unknown): scope is RootScope {
  return typeof scope === 'object' && scope !== null && '__scopeRoot' in scope;
}

export type Scope = ScopeValue | readonly ScopeValue[] | RootScope;

/**
 * Resolves a declared scope against the path inherited from ancestor graphs:
 * undefined (and `[]`) inherit as-is, plain values append, a RootScope
 * replaces from the root. Returns the FINAL parts, or undefined for a bare key.
 */
export function combineScope(
  inherited: readonly ScopeValue[],
  declared: Scope | undefined
): readonly ScopeValue[] | undefined {
  if (declared === undefined) return inherited.length ? inherited : undefined;
  if (isRootScope(declared)) return declared.parts.length ? declared.parts : undefined;
  const parts = Array.isArray(declared) ? (declared as readonly ScopeValue[]) : [declared as ScopeValue];
  const combined = [...inherited, ...parts];
  return combined.length ? combined : undefined;
}

const SCOPE_SEPARATOR = '@';
const PART_SEPARATOR = '/';

function escapePart(part: ScopeValue, key: string): string {
  const type = typeof part;
  if (type !== 'string' && type !== 'number' && type !== 'boolean') {
    throw new Error(
      `Invalid scope value for field "${key}": ${String(part)} (${type}). ` +
        `Scope values must be strings, numbers, or booleans.`
    );
  }
  // The separators must round-trip when they appear inside a value.
  return String(part).replace(/%/g, '%25').replace(/@/g, '%40').replace(/\//g, '%2F');
}

// Structural characters of the address grammar: `@` and `/` are in use, `[`
// and `]` are reserved for per-item addressing (docs/array-intent-addressing.md),
// `%` is the escape prefix. A key containing any of them corrupts parsing.
const RESERVED_IN_KEYS = /[@/[\]%]/;

/** Canonical intent address for a field. No scope -> the bare key. */
export function scopedAddress(key: string, scope: Scope | undefined): string {
  const reserved = RESERVED_IN_KEYS.exec(key);
  if (reserved) {
    throw new Error(
      `Invalid field key "${key}": "${reserved[0]}" is reserved by the intent-address grammar.`
    );
  }
  if (scope === undefined) return key;
  if (isRootScope(scope)) {
    return scope.parts.length ? scopedAddress(key, scope.parts) : key;
  }
  const parts = Array.isArray(scope) ? scope : [scope];
  if (parts.length === 0) return key;
  return key + SCOPE_SEPARATOR + parts.map((part) => escapePart(part as ScopeValue, key)).join(PART_SEPARATOR);
}

/** The field key an address belongs to (for reset-by-key and inspection). */
export function addressKey(address: string): string {
  const index = address.indexOf(SCOPE_SEPARATOR);
  return index === -1 ? address : address.slice(0, index);
}

/**
 * Reads one field's RAW stored value out of a persisted intent record (the
 * `load()`/`save()` format: address -> raw value) — scoped bucket first, bare
 * key as the fallback, mirroring the store's own read order.
 *
 * This is the supported replacement for parsing the storage adapter's on-disk
 * entries directly (the last-used value per group, the
 * mount auto-correct's before-init reads, append-images): external readers go
 * through this instead of coupling to the serialization.
 */
export function readIntentValue(
  stored: Record<string, unknown>,
  key: string,
  scope?: Scope
): unknown {
  const address = scopedAddress(key, scope);
  if (address in stored) return stored[address];
  return address !== key && key in stored ? stored[key] : undefined;
}

/** All stored buckets for one field: scope-part (empty string = unscoped) -> raw value. */
export function readIntentBuckets(
  stored: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const buckets: Record<string, unknown> = {};
  const prefix = key + SCOPE_SEPARATOR;
  for (const [address, value] of Object.entries(stored)) {
    if (address === key) buckets[''] = value;
    else if (address.startsWith(prefix)) buckets[address.slice(prefix.length)] = value;
  }
  return buckets;
}
