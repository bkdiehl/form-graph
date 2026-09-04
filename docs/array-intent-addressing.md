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

## Decided grammar for items (amended for 0.4 — dotted member paths)

```
address   := path ( '@' scopePath )?
path      := key ( '[' itemId ']' ( '.' path )? )?
itemId    := escaped stable identifier (same %-escaping as scope parts,
             plus ']' as '%5D')
```

Examples:

```
runs[a1b2].engine          element a1b2's engine field
runs[a1b2].engine@flux     …remembered per ecosystem scope
runs[a1b2]                 the element's OWN entry (reserved; unused in 0.4)
runs@flux                  the list's OWN entry (order + membership)
runs[a1b2].steps[c3].name  lists compose recursively
```

*Amendment (0.4 proposal, `proposal-0.4.md`): the original sketch put the
item part on the member field's key (`engine[a1b2]`). The dotted path was
chosen instead for legibility — a stored record reads as what it is — and
because the address then names its list, so itemIds need uniqueness only
within their list. The cost is that `.` becomes a structural character,
reserved in keys alongside the others (enforcement is a pre-step of the
0.4 build; keys containing `.` are rejected the way `@ / [ ] %` already
are).*

Decisions folded into that shape:

1. **The path sits before the scope.** Scope answers "under which branch is
   this remembered"; the path answers "which row's which field". A row and
   its parent list share a scope, so the scope suffix stays common to both —
   `runs[a1b2].engine@flux` and `runs@flux` group under one bucket, which
   keeps `reset`/`addressKey`-style matching trivial.
2. **The list field keeps its own entry.** `runs@flux` stores order and
   membership (an array of itemIds); `runs[a1b2].engine@flux` stores that
   element's field value. Reorder touches one entry; an element edit touches
   one entry. This is what makes per-item diff and subscriptions fall out of
   the existing reference-preserving diff, unchanged.
3. **itemIds are caller-supplied and stable**, not indices. An index is not an
   identity — reordering must not rewrite item addresses. The library will
   generate ids only as a convenience on insert; it never derives them from
   position. Uniqueness is per-list: the address names the list.
4. **`[` `]` `.` are structural characters** — `[` `]` reserved in keys today
   (see below), `.` reserved as the 0.4 pre-step, and both escaped inside
   itemIds.

## What is enforced NOW

`scopedAddress` throws in all builds if a **key** contains any structural
character: `@`, `/`, `[`, `]`, or `%`. Before this rule, a key containing `@`
would silently corrupt address parsing; a key containing `[` would collide
with the item grammar the day it ships. Guarded by
`src/lib/core/__tests__/scoped-intent.test.ts`. **`.` is not yet in that
set** — reserving it is the first commit of the 0.4 build, same enforcement
site, same test file.

Storage adapters need no changes: an address is still an opaque string key.
The reservation only guarantees that when `[` appears in a stored address, it
can only mean an item entry.

## Scope of this doc

This doc owns the address grammar only. The API on top of it —
`list(key, memberGraph, { min, max })`, the list ops, per-element
resolution, the React layer — is decided in `proposal-0.4.md`. Cross-item
validation (uniqueness, totals) is a `refine` on the list's own entry.
Migration of existing atomic-array fields: none needed; they keep working
as atomic values. The grammar is additive.
