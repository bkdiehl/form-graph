# 0.4 proposal: collections, external errors, scoped validation

Status: **BUILT — all three features shipped (2026-09-04; see DEVLOG for
the build and review trail, including per-feature deltas and the known
limits list() ships with).** The consumer is civitai's model-training form
rewrite; the port method for the rewrite itself is §4.

Everything else the training form needs, 0.3 already covers — see
"Already covered" at the end if you're evaluating form-graph for that
rewrite.

---

## 1. Collections: `list()` — arrays of sub-records

### The need

A form that holds N independent records of the same shape: training runs
(up to 5, each with its own engine/base-model branch, its own derived
params, its own errors, sharing one dataset), line items, attachments with
per-file settings. Today an array field is an **atomic value** — one intent
entry, one diff unit, whole-array errors. That forecloses per-item errors,
per-item memory, per-item subscriptions, and stable row keys — the four
problems `docs/array-intent-addressing.md` named when it reserved the
grammar.

### Addressing (decided)

Member fields address by **dotted path**:

```
runs[a1b2].engine@scope      element a1b2's engine field
runs[a1b2]@scope             the element's own entry (reserved; unused in 0.4)
runs@scope                   the list's entry: order + membership (array of ids)
runs[a1b2].steps[c3].name    lists compose recursively
```

Chosen over the original grammar sketch (item part on the member key,
`engine[a1b2]`) for legibility: a stored record reads as what it is, and
the address names its list, so **ids need uniqueness only within their
list**. Cost: `.` joins `@ / [ ] %` as a structural character, reserved in
keys. **Pre-step of the build**: `scopedAddress` (and graph definition)
reject keys containing `.`, enforced the same way and in the same tests as
the existing reservations. `docs/array-intent-addressing.md` is amended in
this same change — one source of truth for the grammar.

Reorder touches only the membership entry; an element edit touches only
that element's field entry. This is what makes the React contract below
structural rather than an optimization.

### The API

```ts
const runGraph = defineGraph<TrainingExt>()
  .field('engine', engineDef)
  .use(branch('engine', [...arms] as const))
  .compute('targetSteps', ...);

const trainingGraph = defineGraph<TrainingExt>()
  .field('triggerWord', ...)
  .use(list('runs', runGraph, { min: 1, max: 5 }));
```

- **Any graph can hold a list** — root or member; `list()` composes
  recursively like every other `use`.
- **Per-element resolution.** Each element runs the member graph fully —
  branch arms, computeds, corrections, adopted defaults — against the
  shared ext.
- **Element identity, not index.** `store.list('runs')` exposes
  `.add(seed?) → {success, id}`, `.remove(id)`, `.duplicate(id)`, `.move(id, index)`.
  All go through the write path as gestures, so rules can react.
- **`duplicate` copies the user-written entries** (decided): a duplicate is
  "the same choices" — derived values re-derive in the new element.
- **`min`/`max` are refusals at the op** (decided): `.remove` below `min`
  and `.add` above `max` refuse and return the refusal; the store never
  holds an invalid membership.
- **Errors namespaced per element**, aggregated by `validate()`.
  Cross-element validation (uniqueness, totals) is a refine on the list's
  own entry.
- **Output**: `Data['runs']` is `MemberData[]` in element order; `InferData`
  composes with no new type machinery for consumers.

### The React contract (the load-bearing part)

React lists tend to re-render every row when one row changes. Here render
isolation is structural:

| gesture | intent entries touched | who re-renders |
|---|---|---|
| edit a field of element X | `runs[X].field@…` only | X's subscribers to that field; **no sibling element, not the list shell** |
| add / remove / duplicate | the membership entry (+ the new element's entries) | the list shell (membership subscribers); **no surviving element** |
| reorder | the membership entry only | the list shell only |

Mechanism: the existing reference-preserving diff, unchanged. Element
snapshots keep object identity when their entries didn't move, exactly as
field records do today, so `memo`ized row components bail out on identity.
The React layer ships two pieces:

- `useList('runs')` → `{ ids, add, remove, duplicate, move }` —
  subscribes to the **membership entry only**. Row components key on `id`.
- `<ListElement list="runs" id={id}>` — a provider fixing the element
  address prefix, inside which every existing hook and `Controller` works
  unchanged and subscribes per-element.

A pinned test ships with the feature: render-count assertions proving the
table above (sibling edit → 0 renders for other rows; reorder → 0 renders
for rows). That test is the feature's contract, not a nice-to-have.

---

## 2. External errors: async judgments entering a sync engine

### The need — and the invariant

The engine is sync and **stays sync**. And the store's value model stays
what 0.3.3 settled: one map holding every active field's **actual value**,
with a persist marker deciding what reaches storage — no parallel notion of
"intent" distinct from values. That settles async **values** with no new
API at all:

- a dev writing a value after a response is a plain `store.set` — a write
  is a write; whether the field persists is the field's property, not the
  write's;
- a value the system derives from server data belongs in **ext** — put the
  response in the context and let a default or computed derive from it
  (`setExt` already re-derives adopted defaults correctly). That is the
  principled home for whatIf-style data.

The one genuine gap is **errors**: an async process (a prompt audit
refusing a trigger word, a cost check marking a run unsubmittable) has no
way to attach a validity judgment — the error map is engine-owned.

### The design (decided)

```ts
form.setError('triggerWord', { message: 'This phrase is not allowed.' });
form.clearError('triggerWord');
```

Semantics, all sync — and the same shape as React Hook Form's `setError`,
so a consumer arriving from RHF already knows it:

- External errors live in their own map, merged into the snapshot's error
  chain (`external ?? refine-judged ?? boundary`) and into `validate()` —
  submit fails while one stands, so side-channel `hasIssue` flags
  disappear. Never persisted.
- **Staleness is the engine's job for the common case**: a user write to a
  field clears that field's external error (the same rule the engine
  already applies to its own surfaced errors), and a branch switch that
  deactivates the field drops its error (decided — consistent with the
  engine's per-branch sweeping; an error against an inactive field can
  block nothing). Everything else — clearing on a new request, deciding
  which async result wins a field — is the caller's code, where the caller
  already knows the answer. The lib does not model error provenance.
- List elements address through the path: `setError('runs[a1b2].engine', …)`.

---

## 3. Scoped validation: wizard step boundaries

### The need

`validate()` judges the whole active graph — right for one screen, wrong
for a wizard: step 2's "Next" must not surface step 3's submit-time
requireds.

### The design (decided)

`validate` mirrors `set`'s shape — whole, one, or many:

```ts
store.validate();                          // the whole active graph (unchanged)
store.validate('triggerWord');             // one field
store.validate(STEP2_KEYS);                // a step's fields
store.validate('runs');                    // a whole list, every element
store.validate('runs[a1b2].engine');       // one element's field
```

- Keys are typed against the graph; list paths are addresses, the same
  grammar as everywhere else.
- Identical submit-time semantics — refines and output schemas judged, but
  only for the named fields, errors surfaced only for them.
- No step registry, no field tags: which keys form a step is the
  consumer's business. A wizard defines its step key-lists next to its
  step components; the graph stays step-agnostic.

---

## 4. The port method (the rewrite itself)

The rewrite follows the oracle-first method proven by the generation-form
port (civitai: `.claude/skills/form-graph-port/SKILL.md`,
`docs/form-graph-port-plan.md`), with one training-specific phase 0,
because training has no ready-made oracle — its form→payload
transformation is split across a client mapper, a server mapper, and a DB
JSON blob, with a third near-duplicate mapper for whatIf:

0. **Synthesize the oracle.** Extract the three mappers into pure
   functions — the client run→params mapper, the server
   trainingDetails→step mapper (`createTrainingStep` is already pure) —
   and pin golden fixtures per engine × ecosystem. This phase pays for
   itself even independent of the port: it collapses the whatIf/submit
   mapper duplication and closes the validation asymmetries between the
   two paths.
1. **Differential harness before any graph exists**: graph parse vs the
   synthesized oracle over a generated engine × ecosystem × shape matrix,
   byte-identical, with the parity disciplines the generation port
   established (shape-per-change, case-count canaries, keys-only
   divergence logging). Nothing else starts until parity is measurable.
2. **Port the form core** (wizard step 3, plus the trivial step 1) onto a
   training graph, measured by the harness as it grows: the declarative
   param table becomes defs, the ordered write-back effects become
   computeds/`correct`/rules, the engine × base-model × media-type
   discriminators become `branch`, the five runs become `list()`. Step 2
   (the dataset editor) is not a form and does not port.
3. **Cutover behind ONE feature flag**, generation-style: the flag swaps
   the form and serves the graph's server-side parse per user; comparison
   telemetry runs unconditionally until the old code is deleted. The
   server-side `graph.parse` also closes real enforcement gaps the
   inventory found (client-only ecosystem flag checks, unbounded numeric
   params on the API path).

---

## Already covered in 0.3 (no gap — for anyone evaluating against the training form)

- **Derived-but-overridable params** (repeats seeded from image count,
  AI-Toolkit's editable steps): per-pass `default` functions + adopted
  defaults give seed-until-the-user-edits, re-derive-on-upstream-change —
  replacing the ordered-`useEffect` dependency graph that is the current
  form's hardest part.
- **The `overrides[baseModel][engine]` bounds table**: per-pass defs with
  `cachedFactory`; the duplicated override-resolution sites collapse into
  the graph.
- **Forcings with user feedback** (Prodigy → LR pinned, with a toast):
  `correct` + resolution notes.
- **Discriminated param shapes** (engine × base family × media type):
  `branch`, including state-only discriminators.
- **Server-side enforcement**: `graph.parse` on the server gives the
  submit path a real validation choke point.
- **Server-persisted drafts**: `storage` takes a load closure — fetch the
  persisted record, then construct. First-class usage; needs a docs page,
  not a feature.
