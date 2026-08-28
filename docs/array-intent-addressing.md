# Array fields: the intent-address grammar (design, not yet implemented)

Status: **decided grammar, reserved characters enforced; no array API ships yet.**
This exists so the one decision that gets more expensive after people persist
data is made *before* v0.1.0, not retrofitted after.

## The problem

Array-shaped fields (a list of attachments, line items, selected resources) are
currently modeled as **atomic array-valued codecs**: the whole array is one
value, one intent entry, one diff unit. That works, but it forecloses:

- **per-item errors** — validation can only blame the whole array
- **per-item memory** — removing and re-adding an item loses its edits
- **per-item subscriptions** — a row's UI re-renders when any row changes
- **stable row keys** — list UIs key by index and churn on reorder

All four need *item identity in the intent layer*, and intent addresses are the
persistence format. Whatever grammar items use must not collide with anything
an existing stored record can contain.

## Current grammar

```
address   := key ( '@' scopePath )?
scopePath := part ( '/' part )*
```

- `key` — the field key, verbatim.
- `@` and `/` are structural. Scope *values* containing them are escaped
  (`%40`, `%2F`, `%` itself as `%25`) by `escapePart` in `src/lib/core/scope.ts`.
- Keys are **not** escaped — the grammar is only unambiguous because no key
  contains a structural character.

## Decided grammar for items

```
address   := key itemPart? ( '@' scopePath )?
itemPart  := '[' itemId ']'
itemId    := escaped stable identifier (same %-escaping as scope parts,
             plus ']' as '%5D')
```

Examples:

```
resources[a1b2]            item a1b2 of the resources field
resources[a1b2]@flux       …remembered per ecosystem scope
resources@flux             the array field's OWN entry (order + membership)
```

Decisions folded into that shape:

1. **The item part sits on the key, before the scope.** Scope answers "under
   which branch is this remembered"; identity answers "which row is this".
   A row and its parent array share a scope, so the scope suffix must stay
   common to both — `resources[a1b2]@flux` and `resources@flux` group under
   one bucket, which keeps `reset`/`addressKey`-style matching trivial.
2. **The array field keeps its own entry.** `resources@flux` stores order and
   membership (an array of itemIds); `resources[a1b2]@flux` stores that item's
   value. Reorder touches one entry; an item edit touches one entry. This is
   what makes per-item diff and subscriptions fall out of the existing
   reference-preserving diff, unchanged.
3. **itemIds are caller-supplied and stable**, not indices. An index is not an
   identity — reordering must not rewrite item addresses. The library will
   generate ids only as a convenience on insert; it never derives them from
   position.
4. **`[` `]` are structural characters**, reserved in keys today (see below)
   and escaped inside itemIds tomorrow.

## What is enforced NOW

`scopedAddress` throws in all builds if a **key** contains any structural
character: `@`, `/`, `[`, `]`, or `%`. Before this rule, a key containing `@`
would silently corrupt address parsing; a key containing `[` would collide
with the item grammar the day it ships. Guarded by
`src/lib/core/__tests__/scoped-intent.test.ts`.

Storage adapters need no changes: an address is still an opaque string key.
The reservation only guarantees that when `[` appears in a stored address, it
can only mean an item entry.

## Explicitly out of scope (for the eventual implementation)

- The `Fields` API for arrays (`f.array(...)`? kit-shaped?) — undecided.
- Cross-item validation (uniqueness, totals) — likely a `refine` on the
  array's own entry.
- Migration of existing atomic-array fields — none needed; they keep working
  as atomic values. The grammar is additive.
