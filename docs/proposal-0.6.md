# 0.6: less friction per form

Status: **DRAFT — for discussion.** Nothing here is built.

Source: the ModelVersionUpsertForm port (the second consumer, after the
generation form). The port worked, but it surfaced three complaints worth
answering in the library rather than in each consumer: authoring is more
ceremonious than RHF, adopting the library is hard to defend without a
written criterion, and there is no async story. Ranked by leverage.

## 1. Promote the consumer-side kit into the library

Both consumers re-derive the same two layers; the third would too.

- **`withField(graph)`** — the typed component binder (`bind(Component,
  { fromChange, map })`, meta → props) — moves to `form-graph/react`.
- **Def helpers** (`numberDef`/`boolDef`/`enumDef`/`textDef`: `{ schema,
  ui, default }`, ui meta riding `def.meta`) — move into the library.
  They construct zod, and the core is schema-agnostic (standard schema),
  so they land in a **`form-graph/zod`** entry rather than core.

Also promote the PATTERNS that exist but are undocumented: async data via
ext (the store already evicts and re-adopts defaults on ext change —
built for late-hydrating flags/limits), late defaults, hoisting adapters
to module scope.

## 2. Async checks — at the store edge, never in resolution

Synchronous resolution is the library's load-bearing property (same
rules, same result, client and server, no ordering hazards). `runSchema`
refuses async schemas by design and keeps refusing them. Async
VALIDATION still has a home — the same architectural slot as storage:
the store edge.

**Held until a consumer needs it.** Neither ported form has an async
validation, and shipping capability with zero consumers is how
`scopedStorage` ended up on the cut list. The design below waits for the
training-form port (or another consumer) to produce a concrete check to
build against.

```ts
.field('slug', {
  output: z.string().min(1),
  default: '',
  checkAsync: async (value, ctx, signal) =>
    (await api.slugTaken(value, { signal })) ? 'That URL is taken' : undefined,
})
```

- The store runs checks **debounced on user writes**, latest-wins with an
  `AbortSignal`; a superseded check's result is dropped.
- Results surface on the snapshot as errors carrying a `pending` flag
  while a check is in flight.
- `store.validate()` stays synchronous (structural validity, unchanged).
  **`await store.validateAsync()`** additionally awaits outstanding
  checks — the submit gate. A server parse awaits the same checks
  explicitly, so a uniqueness rule runs identically on both ends.
- Like effects, checks never run on hydration or defaults — a check is a
  judgment on a user's write, not on remembered state.

Non-goals, stated so they stay non-goals: async resolvers, async defs,
async effects, async storage `load`. Any of those poisons every read
path.

Open questions: do checks re-run on ext change (entitlements hydrate
late) or only on the next write; one shared debounce or per-check;
whether `pending` blocks `validateAsync` or resolves optimistically on
abort.

## 3. An adoption criterion, written down

"Why not RHF" needs an answer that isn't preference. Two docs:

- **README: when to use form-graph — and when not.** Use it when a form
  has two or more of: state-dependent field rules, money paths that need
  pinned derivations, server-validated partial saves judged against
  stored state, branching/scoped memory. **RHF (or the host app's
  default) remains the standard for everything else.** A form with static
  fields and a flat schema gains nothing here and should not be ported.
- **Docs page: the failure classes this replaces** — validation attached
  to a form wrapper that silently drops it, clear-then-refill effect
  pairs racing async defaults, money rules living imperatively in submit
  handlers with no revert story. Generic descriptions, no consumer
  specifics.

Consumer-side companion (lives in the consumer repo, noted here for
completeness): tier the port method — oracle-first differential testing
only for money/branching forms; plain parity tests for ordinary ones;
"don't port" for simple ones — so a port's cost is chosen up front.

## 4. Ergonomics of mounted needs (`_ext` vs the bag)

A root graph reads its own prior fields from the def bag; a mounted child
reads its NEEDS through `_ext`, because needs are typed into the Ext
parameter (`type Needs = HostExt & { baseModel: string }`). Nothing tells
an author which side a value arrives on until typecheck — it cost a
cycle even in the port that motivated this proposal.

Options, in ascending invasiveness:

- (a) Document it loudly (mounting guide + a pointed error suggestion).
- (b) A `needs<{...}>()` marker in `defineGraph` options that separates
  "parent fields I read" from "true ext", purely for typing clarity —
  runtime unchanged.
- (c) Merge parent ctx into the child's bag. Honest but deep: it changes
  what a def function's parameter means and how field/computed types
  flow.

(a) now; (b) worth designing; (c) only with a concrete confusion it
alone fixes.

## Considered and rejected: terser field defs

Two shapes for collapsing the `{ input, output, default }` triple were
worked through and dropped:

1. **`lenient(output, default)`** — a helper deriving the input schema.
   Rejected first: deriving a lenient input from an arbitrary schema
   needs zod introspection (breaks the schema-agnostic core), and it
   adds a named concept where the existing surface could carry the
   meaning.
2. **Bare schema as a def** (`.field('name', z.string().min(1))`, with
   `input` optional on the def object as the refined version). Rejected
   on measurement: in the flagship graph most fields never write the
   triple (they go through the def helpers), and seven of the nine raw
   triples are DELIBERATELY asymmetric boundaries (`enumPassthrough`,
   output-enforced JSON columns) that keep an explicit input regardless.
   The change would shrink roughly four fields — not worth a second way
   to write a def, or `.default()` hiding the default mid-chain.

What the discussion surfaced that survives on its own terms, LATER and
as a behavior question rather than ergonomics: the library has no answer
for what a field's boundary does with junk, per boundary. Every author
invents an input schema, and the obvious invention
(`z.string().optional()`) makes wire junk degrade to the default — a
save that silently overwrites a value the user never touched. The
`enumPassthrough` pattern is the hand-built safe version. If that gap is
ever closed, it is a per-boundary semantics proposal (writes error /
storage degrades / wire refuses), not a syntax one.

## Explicitly out of scope for 0.6

- Durable deletion under merge-on-save (the 0.5 documented limitation) —
  revisit when a consumer needs reset-clears-the-record semantics.
- List member paths under the storage map — same trigger.
- `scopedStorage`'s fate — zero live consumers today; decide at the next
  consumer port whether it earns its export or comes out.
