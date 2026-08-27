# form-graph

A SvelteKit library project: the package lives in src/lib (published with
svelte-package), and src/routes is the demo app — the generation form driven
client-side through the Svelte binding, submitting to a form action that parses
with the SAME definition server-side.

Moved here 2026-08-26 from the civitai worktree prototype
(worktrees/form-graph/prototypes/form-graph — now superseded; the parity
harness in that worktree imports from THIS repo). New since the move:

- src/lib/svelte — the Svelte 5 binding (createSubscriber over FormStore).
  Three reactivity tests prove per-field isolation on a second framework,
  mirroring the React render-isolation tests. Gotcha encoded in
  vitest.config.ts: without resolve.conditions ['browser'], vitest loads
  Svelte's SERVER runtime and every effect is silently inert.
- The React binding is .ts (createElement, no JSX) because svelte-package
  copies .tsx raw instead of transpiling it.
- Relative imports carry explicit .js extensions (NodeNext), which is what
  makes the svelte-package dist valid ESM for node consumers.
- Subpath exports: '.' (core), './svelte', './react', './kits' (codecs).
  svelte/react/zod are optional peers.

Commands: `pnpm test` (vitest, all 215), `pnpm check` (svelte-check),
`pnpm typecheck` (tsc over src/lib), `pnpm build` (app + package + publint),
`pnpm dev` (demo).

## Codec types are inferred (2026-08-27)

`codec({ output: z.number().min(1), default: 25 })` infers its value type from
the schemas — verified for primitives, literal unions, and optional objects.
House style: infer by default; annotate `codec<T, M>` only for (a) a NAMED
value interface instead of the anonymous zod shape, (b) an `M` with no carrier
on the codec (meta supplied per-pass at the call site — TS has no partial
inference, so this forces annotating T too), or (c) a deliberate widening,
which the factory then checks the schemas against. The demo forms practice
this; the civitai ports keep annotations where cases (a)/(b) apply.

## Correction became a statement (2026-08-27)

The `correct` FIELD OPTION and the `corrected()` wrapper are gone. Correction
is now `f.correct(key, value, reason, detail?)` — an imperative statement in
the resolver, written right after the field it fixes:

    let ramGb = f.field('ramGb', RAM, { scope: preset });
    if (ramGb > maxRam) ramGb = f.correct('ramGb', maxRam, 'ram_ceiling');

Rationale: the library's thesis is that form logic is plain control flow in the
resolver — existence is an `if`, branching is a `switch` — and the correct
option was the one place logic hid in a callback with an invisible execution
point. Now field OPTIONS are purely declarative (codec, scope, default, meta,
refine) and everything computational is code. The engine updates the record
(value, value-derived meta, refinement re-judge), auto-fills the note's
key/from/to, and returns the new value for reassignment. Kits package it via a
`correct` slot on the kit SPEC, applied by the generated field(). Rule: call
f.correct immediately after the field it corrects, before any dependent field
reads the stale value. All 19 v1 differential parity cases passed unchanged
through the rewrite.

## The real graphs, ported and proven (2026-08-26)

The two most complex civitai generation data-graphs — **ltx-graph.ts** (621 lines: 3 version subgraphs, distilled-model field visibility, resolution-driven tables) and **wan-graph.ts** (653 lines: 5 version subgraphs, flag-driven 2.2 modes, workflow/resolution ecosystem sync) — are reproduced at full fidelity in `src/lib/civitai/` (constants derived from the real config, codecs mirroring v1 common.ts exactly, family resolvers + a video hub slice).

**The verbatim v1 code is vendored** into `src/v1/civitai/` (engine + all graphs + real basemodel/generation constants; `~/`-imports resolved by a vitest alias, checked by `pnpm run typecheck:v1`). That makes the differential harness self-contained: `src/v1/__tests__/` runs the SAME inputs through the real `generationGraph.safeParse` and `videoForm.parse`:

- **19 branch parity cases** (values + key SETS, per branch) — pass with ZERO documented deltas.
- **13 table pins** — the port constants deep-equal the vendored tables, so duplication cannot drift.
- **Compile-time type parity** — port field types checked against v1 InferDataGraph unions; this caught two real port bugs (un-narrowed branch discriminants; a string-widened enum).

Two v1 behaviours the port deliberately mirrors: parse does NOT correct a workflow-incompatible ecosystem (that is an effect/rule, set()-time only), and `vid2vid:edit` is not currently configured for LTX despite ltx-graph supporting it. Demo: /demo/video.

Everything below is the prototype's living record, still accurate for the
library itself.

---


A from-scratch alternative to `src/libs/data-graph`, built to be evaluated rather than shipped —
and designed as a **generic library**: `src/core` imports no packages — only its own files (the schema contract is
structural, so zod is never imported; validators are carried in by codecs), `src/react` depends
only on react, and everything domain-flavored (codec factories, resolvers, fixtures, the demo)
sits outside those two directories. The extraction target is a dependency-free
`packages/form-graph` with `/react` and `/storage` entry points, reusable in other projects —
including the SvelteKit spokes via a thin `/svelte` adapter, since the core is framework-free.
The design rationale lives in [`docs/data-graph-rethink.md`](../../docs/data-graph-rethink.md);
this README covers what exists, how to run it, and what the prototype has already proven or
disproven.

**Status: phases 1–4 complete, plus the complexity-audit gap closures.** Phase 1 (core engine)
with the decided design items — scoped intent, Standard Schema acceptance, registry-typed
controllers; phase 2's `common.ts` codec ports in `src/codecs/`, with the checkpoint machinery
(locked substitution as notes, version-equivalence moves as projection, the three model effects
as one reconciler rule) and the loose-state/strict-output resources contract; phase 3's
covering-set generation form (`src/generation/`) — the hub with gates and per-workflow
ecosystem memory; flux, SD, LTX, NanoBanana, wan, and image-upscale branches — which the demo
renders; phase 4's remaining claims measured on the real form; and the five mechanism gaps from
the audit, closed below. 192 tests, typecheck clean.

Real-branch numbers (SD, the heaviest), re-measured after the gap closures added triggerWords,
gate folding, and priority meta to the hub resolve: **0.0127 ms** per keystroke, **0.0102 ms**
for a full ecosystem branch switch, **0.0114 ms** for a cold server parse. (Phase 3's pre-gap
numbers were 0.009/0.0086/0.0083 — a real ~40% relative increase, still ~3 orders of magnitude
inside frame budget.)

## Phase 4: every remaining claim measured on the real form

- **Render isolation, tested on the real form** (`real-form-isolation.test.tsx`): a prompt
  keystroke re-renders one control; a typing burst leaves every other probe untouched; an
  ecosystem switch re-renders exactly the fields whose data moved (prompt survives it without a
  render); an ext change nothing consumes re-renders nothing. Verified live too: a keystroke
  burst in the demo left all 17 other field counters at exactly 1.
- **The type-scale question is closed** (`src/__stress__/scale-40.ts` — the analog of v1's
  depth-budget stress file, for the opposite claim): a 40-branch union with unique per-branch
  fields costs **+543 types, +908 instantiations, ~1 MB, and no measurable check time**
  (0.53 s vs 0.54 s full-project tsc). v1's measured cost for its union machinery was +44%
  full-repo tsc and a hard TS2589 ceiling at ~46 chained calls. Native switch-return inference
  scales linearly and shallowly.
- **Observability in the harness**: the Inspector shows `getNotes()` (silent adjustments — model
  substitutions and other projection corrections) whenever a pass produced any.

```bash
pnpm install     # own workspace root — does not touch the main app's lockfile
pnpm test        # 192 tests
pnpm typecheck
pnpm bench       # keystroke cost
pnpm dev         # demo harness
```

## The idea in one paragraph

State is **intent** — every value the user has ever set, never deleted when a branch
deactivates. A **resolver** is a pure function that projects intent onto the active branch:
`resolve(intent, ext) -> snapshot`. A conditional field is an `if`, a computed is a `const`, a
dependency is a variable reference, and a discriminated branch is a `switch` — so TypeScript
infers the state union natively, with no type machinery and no instantiation-depth budget. Every
change recomputes the whole form; a structural diff then hands back the *previous object
reference* for each unchanged field, so React re-renders only the controls whose data moved.

## Layout

| Path | What |
|---|---|
| `src/core/resolve.ts` | The `Fields` collector and `resolve()` |
| `src/core/store.ts` | Intent, set/reset/validate/output, subscriptions, codec-churn guard |
| `src/core/diff.ts` | Reference-preserving snapshot diff — the render-isolation mechanism |
| `src/core/intent.ts` | Intent entries, trusted vs boundary, identity-keyed parse cache |
| `src/core/form.ts` | `defineForm`, pure `parse`/`parsePartial` (the server entry point) |
| `src/core/types.ts` | `Codec` (the dual input/output schema contract), snapshots |
| `src/core/introspect.ts` | Structural questions, answered by executing resolvers |
| `src/core/scope.ts` | Scoped intent addresses (`steps@Flux/2`) |
| `src/core/run-schema.ts` | Structural + Standard Schema execution |
| `src/core/storage.ts` | `debouncedStorage` — the deferred-write wrapper |
| `src/codecs/` | Field kits + codec helpers: checkpoint, resources, select, quantity, vae/upscaler, controlnets, media (images/video/scaleFactor), slider/seed/enum/aspect-ratio/text |
| `src/generation/` | The covering-set generation form: hub, flux, ecosystems (SD/LTX/NanoBanana/wan), shared sections, gates, config |
| `src/react/` | `useForm`, `Controller`, `useField` — same contract as v1 |
| `src/__fixtures__/mini-generation.ts` | Compact mirror of the real graph shape |
| `src/__fixtures__/parity-generation.ts` | Shapes v1's own tests exercise |
| `src/__tests__/v1-parity.test.ts` | v1's behavioural contract, re-asserted |
| `src/__bench__/keystroke.bench.ts` | Keystroke cost |
| `src/demo/` | Auto-rendered form with live render counters and a server-parse panel |

## What the prototype has established

**Native discriminated unions work.** `src/__tests__/types.test.ts` asserts at compile time that
`Extract<MiniState, { ecosystem: 'Flux'; fluxMode: 'standard' }>` narrows exactly as the server
handlers need, that non-matching branches genuinely *lack* the other branch's fields, and that
flat key lookup across branches still types. No `BuildDiscriminatedUnion`, no
`groupedDiscriminator`, no depth budget.

**Render isolation holds under a full recompute.** `src/react/__tests__/render-isolation.test.tsx`
counts real renders: editing one field re-renders one control, the provider subtree never
re-renders, and controls whose field left the branch unmount. Verified by hand in the demo too —
24 keystrokes in `prompt` leave every other field's counter at 1.

**Client and server produce the same output by construction.** `parse()` is pure and walks the
same resolve-then-validate pipeline as the client; a test asserts `store.output()` equals
`miniForm.parse(store.getIntent(), ext).data` for the same choices.

**Branch memory is free.** Leaving and returning to a branch restores prior values on both client
and server, because they live in intent rather than in a client-only storage adapter.

## Three findings that changed the design

### 1. Build codecs once — per-pass construction costs 152x

Constructing zod schemas inside a resolver dominates everything else on the keystroke path.
Measured on a 35-field form (`pnpm bench`, 32-core Windows box):

| keystroke, ~35 fields | mean |
|---|---|
| codecs hoisted to module scope | **0.0060 ms** |
| codecs constructed per pass | 0.74 ms (**~120x**) |

Schema *execution* is cheap by comparison — `validate()` over all 35 output schemas is 0.008 ms.
So the answer to "would a full recompute lag typing?" is no, by roughly three orders of
magnitude, **provided codecs are hoisted**. Because nothing about a churning resolver looks
wrong, the store tracks codec identity and `getCodecChurn()` reports keys whose codec is rebuilt
on consecutive passes (`src/core/__tests__/codec-churn.test.ts`). (152x was the first
measurement, before the scope/pending machinery added ~1µs to the hoisted path — prose citing
152x refers to that original run.)

### 2. The active-key array must keep its identity

The first demo re-rendered *every* field on every keystroke while the unit tests passed. The
cause was in the engine, not the demo: `diffSnapshot` returned a fresh `keys` array each
resolve, so any consumer rendering the field list re-rendered per keystroke and took its children
with it. Per-field diffing cannot save you from a parent that re-renders. `diff.ts` now reuses
the previous array when the active set is unchanged, with tests either way.

### 3. Introspection was the stated risk. It isn't one.

The concern was that making definitions *code* rather than *data* would break v1's structural
queries. An audit of the actual call sites outside `libs/data-graph` found the surface is far
smaller than assumed:

| v1 API | external call sites | status |
|---|---|---|
| `workflowHasNode` | 2, both in `useGeneratedItemWorkflows` | replaced by `hasField` |
| `getWorkflowsForMediaType` | 1, same hook, built on the above | replaced by `whereFieldExists` |
| `applyWhatIfFingerprints` | 1 | **not structural** — a key→projection map over a snapshot, works as-is |
| `getAllPossibleKeys` | 0 | unused |

`src/core/introspect.ts` answers these by *executing* resolvers, expanding each axis over the
`meta.options` the form already publishes — so there is no separate branch table to keep in sync.
Executing is also more accurate than walking: v1's structural walk has to approximate conditions
it cannot evaluate (`try/catch`, "assume the node is active if the factory throws"), whereas the
real resolver simply decides. `introspect.test.ts` covers a conditional field that v1 can only
guess at.

Cost at production scale (30 workflows × 30 ecosystems, 871 branches):

| | mean |
|---|---|
| full `enumerateBranches` over both axes | 1.27 ms |
| one `hasField` question | 0.0012 ms |

Cheap enough to compute eagerly at module load; v1's per-question cache becomes an optimisation
rather than a requirement.

## v1 behavioural parity

`src/__tests__/v1-parity.test.ts` re-asserts v1's contract against the new engine, block by
block, naming the v1 file each case comes from. `src/__fixtures__/parity-generation.ts` mirrors
the shapes those tests exercise (per-workflow checkpoint options, turbo slider ranges, a toggle
that disappears for some versions, the substitution clamp).

Worth knowing: v1's *library* suite is 2 tests (`data-graph.test.ts`, external-context deps). The
real behavioural spec is ~96 tests spread across the generation graphs, which exercise the engine
through real graphs. `experimental.test.ts` and `gates.test.ts` test pure helpers and would port
unchanged — they never touch the engine.

Three things the port surfaced:

**Diagnostics belong in the return value, not on ext.** v1 reports silent checkpoint substitutions
through a mutable collector hung on the external context, which — as `context.ts` warns — must be
attached to a freshly built context object or it leaks between requests. Here a resolver calls
`f.note()` (or declares `noteOnProject`, which fires only when a projection actually changed the
value) and the notes come back as part of the resolution. Deterministic, per-call, impossible to
share by accident; there is a test that notes cannot leak between parses.

**A clamp no longer destroys the user's value — a real behavioural difference.** (Decided as
open question 7 in the rethink doc: keep the new behaviour.)
v1 writes a clamped value back into ctx, so standard(40 steps) → turbo(clamps to 12) → standard
leaves you at 12. The new engine keeps intent at 40 and clamps only in projection, so going back
restores 40. Better in the resources case (a limit loosening restores the user's picks), and
confirmed as the intended behaviour. Both directions are pinned in the parity suite.

**One v1 test documents a limitation this design removes.** `data-graph.test.ts` explains it
cannot assert that a node's ext-derived `.max()` actually constrains the value, because
`_evaluate` coerces a schema-failing value back to the node default, so it is never observable
downstream. Under projection the clamped value *is* what state holds, so the parity suite asserts
it directly.

## Decided-and-built (from the rethink doc's answered questions)

**Scoped intent** (`src/core/scope.ts` + the pending flow in `store.ts`/`resolve.ts`): a field
declares `scope` at its call site with values the resolver already has —
`scope: turbo ? [eco, model.id] : [eco]` — and its memory lives at `steps@Flux/2` style
addresses. One key holds per-branch values simultaneously (the flat-intent hole, closed);
`set()` patches and boundary defaults arrive by key and are committed to whichever bucket the
field resolves with (the *pending* flow); writes to inactive fields land at the bare key, which
scoped reads use as a fallback until an explicit write supersedes it. Reset-by-key keeps every
bucket of an excluded key; storage round-trips addresses verbatim. Covered in
`scoped-intent.test.ts`.

**Standard Schema acceptance** (`src/core/run-schema.ts`): codecs may carry `~standard.validate`
schemas (valibot, arktype, hand-written) alongside the structural `parse`/`safeParse` contract.
Sync only — an async validator throws with a clear message. zod implements both contracts and
keeps its native `safeParse` path. Covered in `standard-schema.test.ts`.

**Registry-typed controllers** (`createTypedController` + `RegistryValues`/`RegistryMetas`): the
app declares one codec-registry object; `<GenController name="steps">` then infers `value` and
`meta` per key with zero call-site generics and O(1) type cost. Compile-time-asserted in
`typed-controller.test.tsx`.

**Deferred storage writes** (`debouncedStorage` in `src/core/storage.ts`): wraps any adapter so
writes happen at most once per `delayMs` with the latest intent (a trailing throttle — continuous
typing can't postpone it forever), with `flush()` for `pagehide`/`visibilitychange`. Measured
context: the *engine's* keystroke path costs ~6µs with or without an immediate serializing
adapter — serialization is not the problem at this intent size — but real `localStorage.setItem`
is synchronous disk-backed IO that can spike on the main thread, which is what the wrapper takes
off the keystroke path. The store also skips `save()` entirely when a `set()` changed nothing.
The demo dogfoods the wrapper. Covered in `debounced-storage.test.ts`.

## Phase 2: the `common.ts` codec ports (`src/codecs/`)

**The factory pattern: `defineFieldKit`** (`src/core/field-kit.ts`) — the library's base
factory for defining a field. A field definition has a fixed anatomy — key, codec, per-pass
options, and the patch rules that must travel with it — and the base factory owns that anatomy
so every field in an app has the same shape:

```ts
const createCheckpointKit = defineFieldKit({
  key: 'model',
  codec: CHECKPOINT,                                  // resolved ONCE per kit
  options: (config, args) => ({ default, project, noteOnProject, meta }),
  reconciler: (config) => rule,                       // travels with the field
});
const checkpoint = createCheckpointKit({ catalog, workflowVersions, appliesTo });
// resolver:      checkpoint.field(f, { ctx: { workflow, ecosystem } })
// form rules:    reconcile: [checkpoint.reconciler]
```

What the factory *enforces* rather than documents: the codec resolves once at kit creation
(config-parameterised codecs cannot be rebuilt per pass, so the churn rule holds structurally);
the field key is declared, not buried in a helper body; `reconciler` is always present
(identity when the spec has none), so rule arrays compose uniformly; and shared config reaches
the field and its rules from one binding — passing it to each separately is the drift the first
draft had. `appliesTo` scopes a kit's rules to its own branch — v1 got that from branch
mount/unmount; here it's explicit. Both checkpoint and resources are defined through it; a
truly simple field can still be a hoisted codec plus `f.field` directly.

The centerpiece is **checkpoint** (`checkpoint.ts`), v1's hardest node, restated:

- the locked-model substitution (issue #3520, observe-only) is `noteOnProject` — the mutable
  collector on ext is gone, and the note carries requested/applied/ecosystem/workflow
- ecosystem-compat reset and the workflow-version equivalence move (fast→fast via
  `buildVersionMappings`) are `project` — enforced by construction, server included
- the three model-driven effects are **one reconciler rule** (`checkpointReconciler`):
  model-from-another-ecosystem switches ecosystem (and workflow when needed),
  variant-excluded models fall back to the parent workflow, and a checkpoint offered only by
  another workflow switches to it. Q10's array composition is engine-level: rules compose
  left-to-right, later rules see earlier rules' corrections (tested).
- gate filtering of the version picker (`filterVersionGroup`, parent-repoint semantics) stays
  pure derivation in meta

Everything app-specific enters via an injected `CheckpointCatalog` (basemodel tables, workflow
availability, variants) — the real app passes its constants, tests pass tiny ones, and the
codec layer stays library-generic.

**Resources** (`resources.ts`) settles Q11 in code: state holds `ResourceValue` (an `{ id }`
stub at minimum — loose hydrated objects pass through), output validation strips to the strict
`resourceSchema` and *rejects* un-hydrated stubs, which is what prompts hydration before
submit. Compatibility filtering and the live ext limit are one `project`. Hydration itself
stays outside the engine, where v1 keeps it.

The type-tightening from §10 of the rethink doc earned its keep here: the compiler rejected the
first draft because the loose input's result type didn't match the state type — exactly the
input-must-produce-state-shape contract, catching for free what v1 leaves to convention.

## Phase 3: the covering-set generation form (`src/generation/`)

The six-graph covering set against real shapes: `hub.ts` (workflow with key migration + the
gate refine as `FieldOptions.validate`, ecosystem remembered PER WORKFLOW via scope, routing by
ecosystem GROUP so grouped ecosystems share a code path), `flux.ts` (mode switch on real
version ids, the draft coupling rule), `ecosystems.ts` (SD with sampler/scheduler/vae/clipSkip;
LTX with resolution-dependent aspect-ratio codecs — one hoisted codec per resolution, the
resolution picks WHICH; NanoBanana; and, from the gap closures, wan), and the upscale branch
inline in the hub. `gates.ts` is a
near-verbatim port (pure zod). Snippets' converging registration effect is a one-line computed
(`snippetTargets`) because the active editors are declared in the same pass.

Two findings from the port, both already folded in:

- **A reconciler can defeat scoped memory.** The v1 effect "workflow changed → switch
  incompatible ecosystem" reclassified from selection-coupling to VALIDITY CLAMP: as a patch
  rule it forced the workflow's default before the target workflow's remembered ecosystem could
  resolve; as the ecosystem field's projection it is per-scope and the memory wins — matching
  v1, where the storage reload beats the effect. Rule of thumb: if v1's storage ordering matters
  to an effect, it's a projection here.
- **`getIntent()` is the persistence format, not a parse payload.** Scoped addresses
  (`steps@flux`) don't resolve by key in `parse`. Parity is stated over what the server actually
  receives: the flat visible state, and the `output()` payload round-trips unchanged.

One engine addition: `FieldOptions.validate` — a per-pass output constraint for ext-dependent
rules that must ERROR rather than clamp (the gated-workflow submit backstop). `project` corrects
silently; `validate` refuses.

**All named fields go through `defineFieldKit`.** The rubric: a *kit* is a NAMED field of the
form (`model`, `resources`, `vae`, `controlNets`, `quantity`, `sampler`, `scheduler`,
`upscaler`) — it owns a key, and often config or rules. A bare *codec helper*
(`sliderCodec`, `seedCodec`, `enumCodec`, `aspectRatioCodec`, `textCodec`) is an anonymous
value shape reused under many names. Ported so far as kits: checkpoint, resources,
sampler/scheduler (`select.ts`), quantity (live ext max via projection), vae (the
incompatible-clear effect as projection), upscaler, controlNets (per-ecosystem preprocessor
refine, staged-row semantics: imageless entries live in state, drop from output), and the media
kits (`media.ts`): images (first/last-frame, reference, source and edit configurations), video,
scaleFactor. Snippets is a field plus the `snippetTargets` computed in
`src/generation/shared.ts`. Nothing remains to port for phase 3.

## End-to-end: the parity harness and the package check

**Why development stays in this worktree**: parity testing against the real v1. The differential
harness lives in the MAIN app's test tree (local-only, on this never-merged branch):
`src/shared/data-graph/generation/__tests__/formgraph-parity.test.ts` — the same raw input
through v1's `generationGraph.safeParse` (the exact validator the server runs) and form-graph's
`generationForm.parse`, compared key-by-key on flux txt2img (real version ids). Run from the
worktree root:

```bash
pnpm exec vitest run --project 'unit*' src/shared/data-graph/generation/__tests__/formgraph-parity.test.ts
```

Green today: shared scalar fields identical, draft coupling identical (the harness's first run
caught that the pure parse path needed the draft default the v1 EFFECT provides — fixed via
`CheckpointFieldArgs.defaultModelId`), locked-model substitution identical, missing-prompt and
gated-workflow failures identical, and the over-limit-resources divergence asserted as the
DECIDED behaviour difference it is (v1 errors, form-graph clamps). Its first run also proved
config fidelity matters even for leniency: v1 resolves `'16:9'` to `'3:2'` because the real
SDXL buckets have no 16:9 — parity held only after copying the real table.

**Publishability check** (`pnpm build:lib`, tsup): `.`, `./react`, `./kits` entries emit
ESM+CJS+d.ts with react/zod external; both formats smoke-tested by executing a parse from the
built artifact. Extraction to a standalone npm package happens once parity coverage is
convincing — until then, development continues here.

## THE RULE STANDARD: two homes, one assembly shape

Rules were the freeform corner of the design — some modules exported typed consts, some
returned inline arrays, kits carried theirs internally, and the form spread all three. The
standard mirrors what `defineFieldKit` already did for fields:

**Every rule lives in exactly one of two homes**, both exposing a single `reconciler`:

1. **A field kit's `rules` slot** — rules owned by ONE field (the checkpoint's three
   model-driven effects, keyed `model`).
2. **A `defineRules` unit** — rules owned by a module or a RELATIONSHIP between fields (the
   flux draft↔model coupling, wan's resolution↔ecosystem mapping, the hub's
   ecosystem→workflow rule).

Both take the same shape: **rules are a RECORD keyed by the trigger field** — the same
key→definition form fields use, no wrapper vocabulary. A rule fires when its key is in the
patch, receives the typed patch value, and returns the keys to ADD (or nothing):

```ts
const createFluxCoupling = defineRules<void, FluxRuleState>({
  scope: (state) => state.ecosystem === 'Flux1',   // branch guard, a named slot
  rules: () => ({
    workflow: (workflow, { patch, state }) => { ... },
    model: (model, { state }) => {
      if (model?.id === fluxVersionIds.draft && state.workflow !== 'txt2img:draft') {
        return { workflow: 'txt2img:draft' };
      }
    },
  }),
});
export const fluxCoupling = createFluxCoupling();
```

**And the form's `reconcile:` is a list of named units — never bare functions:**

```ts
reconcile: [hubCoupling, fluxCoupling, fluxCheckpoint, sdCheckpoint, ltxCheckpoint,
            wanCoupling, wanCheckpoint, nbCheckpoint]
```

That's the whole rule vocabulary: `defineRules` (or a kit's `rules` slot), a record keyed by
trigger, `scope` for branch guarding. Rules run once, pre-propagation, over the patch — v1's
"when X changes, do this" readability without effects' loop hazards. All shipped rules follow
the standard; 192 + 6 parity tests unchanged through the refactor.

## The consumption audit: server pipeline + client provider, diffed and closed

Two audits swept every way the app CONSUMES v1 — `orchestration-new.service.ts` + the ~40
handlers, and `GenerationFormProvider` + whatIf + the imperative generation store. Verdict: the
swap is mostly mechanical (`errors` shape matches; handlers read plain fields off the union via
the same `Extract<>` pattern; the store API maps 1:1 for set/subscribe/reset/validate/meta).
The real gaps, all closed and pinned in `consumption-audit.test.ts`:

- **Computed-key identification** (v1's `result.nodes`; the server strips derived values —
  `triggerWords`, `targetDimensions` — from persisted params so remix never replays them):
  `parse()` now returns `computedKeys`, and the store exposes `getComputedKeys()` (whatIf
  fingerprints, the snapshot cache).
- **Substitution-note fidelity** (#3520): notes were already returned on FAILED parses (v1
  emits substitutions regardless of success — now pinned); the note's `detail` now carries a
  `reason` classified AT THE SOURCE (`locked_default` / `ecosystem_mismatch` /
  `workflow_version_swap`) — v1 reconstructs this post-hoc with a graph-probing classifier.
- **The capability probe** (v1's `clone()`/`init()`/`getNodeMeta('model')` powering
  `workflow-capability.ts` and the App Blocks version guard): `fieldMeta(form, 'model', pins,
  ext)` in introspection.
- **`clearStorageForOutput` / `removeKey` sweeps**: `store.prune(predicate)` over intent
  addresses, persisted through storage.
- **The `validate(externalData)` overload** (whatIf pricing an empty-prompt form): not ported —
  replaced by a PURE parse of overridden visible state
  (`parse({...state, prompt: 'cost-estimation'}, ext)`), which never touches the store and so
  cannot loop the whatIf subscription. Pinned.

Two v1 pain points turned out to be SOLVED BY DESIGN, now proven rather than claimed:

- The compat-modal flow (set workflow+ecosystem → synchronously re-read the target scope's
  remembered resources) needed v1's storage `valueProvider`; here scoped intent IS the memory,
  and the snapshot after `set()` already holds the target scope's values.
- v1's two-stage discriminator set (the PolyGen remix workaround: discriminators first, then
  the value blob, else child keys get dropped): one `set()` carrying discriminators AND child
  keys lands everything, because pending values resolve in the same pass as the new branch.

The migration contracts are now IMPLEMENTED, not notes (`migration-contracts.test.ts` + the
key-presence block in the parity harness):

- **The three raw-localStorage readers have a supported recipe**: `readIntentValue(stored,
  key, scope)` / `readIntentBuckets(stored, key)` over the persisted intent record — scoped
  bucket first, bare-key fallback, mirroring the store's own read order. Each v1 path is
  pinned as a test: last-used checkpoint per ecosystem group, the mount auto-correct's
  stored-vs-resolved comparison, and append-images reading a NON-ACTIVE workflow's bucket.
- **The scoping those readers depend on is now real in the form**: `model` remembered per
  ecosystem GROUP (SD1/SDXL share; return to flux restores your krea pick) and `images` per
  WORKFLOW — matching v1's storage groups, expressed as `scope:` at the field call sites.
- **Per-branch key presence is an ENFORCED parity test**, not a to-check note: the harness
  diffs v1's and form-graph's output key sets and fails on any difference that isn't in an
  explicit documented-delta allowlist (each entry with a named reason). Its first run
  immediately caught an undocumented one — v1's flux parse omits `snippets` while form-graph
  materialises the default — now documented with a verify-at-port note.

## Pre-extraction hardening: the API surface and the error shape

**Superseded in part (2026-08-26): the correction surface was redesigned.** `project`/`noteOnProject`/`validate` no longer exist. Older mentions below and elsewhere in this record are historical. The current per-field surface:

- **`correct: (value) => value | corrected(newValue, reason, detail?)`** — per-pass silent replacement for mismatches the SYSTEM caused (stale stored option, a ceiling another field lowered). The engine auto-fills the note (`key`/`from`/`to`); the reason is co-located with the decision instead of split into a second prop. The note also lands on the field SNAPSHOT (`snapshot.note`) for inline display.
- **`refine: (s) => s.refine(...)` + `refineDeps`** — the output contract narrowed under this pass conditions, in zod own vocabulary (`message`/`params.kind` are the channels). Refusal with a LIVE error during editing, not just at submit. Construction is deps-cached (React-style array): typing never rebuilds a schema — proven by test — so the codec-churn rule holds. Deps must be STABLE values; a per-pass Set/array identity defeats the cache (derive a canonical string, see hub.ts gatedKey).

The split is principled — **schemas judge, functions transform**: refusal is schema-shaped (zod), replacement is a function returning a value+reason. A unified .catch-based design was considered and rejected: .catch swallows refusals upstream in the chain, computed substitutions lose their reason channel, and Standard Schema has no recovery equivalent. Checkpoint substitution notes changed shape with this: `kind` IS the classified reason (`locked_default`, ...) rather than a generic `model-substitution` wrapper.


Two decisions taken while reviewing the package as an npm surface, before anything freezes:

- **The public index is authoring + runtime + introspection + migration ONLY.** Engine
  internals (`resolve`, `compileRules`, `runSchema`, `validateResolution`, `diffSnapshot`,
  the intent entry constructors, `deepEqual`, `schemaFrom`) are no longer exported — every
  published signature is frozen at first release, and consumers reach all of them through the
  form definition. `FormStore` and `FormDefinition` export as TYPES only (creation goes
  through `defineForm` / `form.createStore()`); `PatchReconciler` left the surface with them
  (the rules standard superseded it as authoring API). `ValueOf` is now `InferFieldValue`,
  joining the `Infer*` family and dodging collisions with consumers' own utility types.
  Package-internal code imports internals from their modules directly.
- **`FieldError` carries EVERY issue, with paths.** Previously only `issues[0]` survived and
  `path` was dropped — a resources array with three invalid entries reported one, with no way
  to tell which row. Now `{ message, code, issues: SchemaIssue[] }`: `message`/`code` mirror
  the first issue for the render-one-message case, and each issue's `path` is relative to the
  field (`[2, 'id']` = row 2's id). Issues stay normalized to `SchemaIssue` rather than
  exposing `ZodError` — the shape is identical for zod and Standard Schema codecs, and the
  public API stays uncoupled from zod's issue format across major versions.

## Where the output types live, and how to consume them

One type family, three doors — all inferred from the resolver, none hand-written:

| Type | Where | What it types |
|---|---|---|
| `GenerationState` | `src/generation/hub.ts` | The full union: `store.getState()`, `parse().data`/`.state`, `output()` |
| `ImageFamilyState` / `VideoFamilyState` | `src/generation/families.ts` | The bounded per-family unions — what handlers/components import |
| `Extract<ImageFamilyState, { ecosystem: 'Flux1' }>` | at the consumer | One branch — v1's `Extract<GenerationGraphTypes['Ctx'], …>` pattern, unchanged |

Consumption, concretely:

```ts
// SERVER (what orchestration-new.service does today with safeParse):
const result = generationForm.parse(body, ext);
if (!result.success) throw invalidInput(result.errors);
result.data;                       // GenerationState — the typed union
switch (result.data.ecosystem) { ... }   // narrows per branch

// HANDLER (per-ecosystem, bounded to the family):
type FluxInput = Extract<ImageFamilyState, { ecosystem: 'Flux1' }>;
function buildFluxStep(data: FluxInput) { data.fluxMode; data.cfgScale; ... }

// CLIENT submission:
const payload = store.output();    // GenerationState — strict, stripped view
```

`parse().data` and `output()` are typed `State` on a stated claim (same as v1 typing safeParse
data as `Ctx`): the output view holds the same KEYS with per-key output-validated values —
strict schemas may STRIP extra properties (enriched resources) but never change a key's
declared shape. Branch-only fields require narrowing first (`'steps' in data`, a discriminant
switch, or `Extract`) — the compiler enforces it, which is the point.

To SEE a type: hover `GenerationState` (or a family alias) in the editor, or hover
`result.data` inside a narrowed branch. Post-extraction, these become the package's exported
`.d.ts` surface.

## Scaling the union: output families

The generator grows a new graph per model family forever — v1 eventually hit a compile wall
(TS2589). Measured here first (`src/__stress__/scale-60-*.ts`, 60 branches × ~22 realistic
fields + a nested mode sub-branch ≈ 120 union members): the flat union costs **~0.13 s** of
check time and the family split saves only ~20% of instantiations — because v1's wall was
instantiation DEPTH (accumulated generics), which switch-return inference doesn't accumulate;
this design's cost is WIDTH and grows linearly. No wall is in sight at any plausible ecosystem
count.

The output-family split (`src/generation/families.ts`: image / video, extendable to audio/3d)
is adopted anyway, for locality rather than survival:

- **Handlers and components import the FAMILY state** (`ImageFamilyState`,
  `VideoFamilyState`) — `Extract<>` over ~a dozen members regardless of total form size, and
  hovers print the alias, not a 40-member union.
- **New families are a new file + one hub case**, not edits to a monolithic switch.
- **Post-extraction, families are the code-splitting seam** — video resolvers stay out of
  image-page bundles.

Escalation path if a wall ever DOES appear: stop composing family states into one global
union (consumers already import per-family), then one form per family as the final escape
hatch. Both are open because the family layer exists.

## Why cycles can't happen (and the one place they're detected instead)

v1's evaluation loop needed a 1000-iteration circuit breaker because it had a dependency graph
that could cycle. This design replaces the graph with one-shot structures, so each cycle shape
is prevented by construction — pinned in `cycles.test.ts`:

- **Field derivations**: "A depends on B" means B is a variable declared ABOVE A in the
  resolver. The language's evaluation order IS the dependency order; a cycle is a use-before-
  declaration compile error, not a runtime loop.
- **Rules**: one ordered pass per `set()` — each rule executes at most once, additions reach
  only LATER rules, no rewind. A mutually-referencing pair with no guards (v1's flux-effects
  nightmare shape) terminates unconditionally; the failure mode is wrong-but-terminating, never
  a hang, and ordering is explicit in the `reconcile:` array.

  *Worked example — the flux coupling LOOKS circular (workflow sets model, model sets
  workflow) but is two one-way rules with one driver per set().* User sets workflow to draft:
  the `workflow` rule fires, adds the draft model; the `model` rule then fires on that
  addition and writes `workflow: draft` — the value the patch already holds, a no-op — and the
  pass ends. The `workflow` rule is NOT re-run by that write; it had its one turn. User sets
  the model instead: the `workflow` rule is skipped (not in the patch), the `model` rule adds
  the workflow, done. The pair converges because both rules target the SAME consistent
  end-state; guards in rules exist for correctness (defer to the user's mixed patch), never
  for termination.
- **Projections** see only their own field's value; **resolution cannot re-enter** (the
  `Fields` collector has no `set`); the pipeline is one-directional
  (`set → reconcile → commit → resolve → diff → notify`).
- **The one undetectable-by-construction shape**: a SUBSCRIBER calling `set()` from its own
  notification with a value that keeps changing. Convergent cascades terminate via the
  equal-value early-out; divergent ones now throw at notify depth 25 — the engine's only
  runtime cycle check.
- **Module-level import cycles** (the JS kind — v1's `media-schemas.ts` exists purely to dodge
  a circular-import TDZ) are held off by the layer DAG: core ← codecs ← generation shared ←
  leaves ← hub, one direction only. Post-extraction this becomes mechanical (`import/no-cycle`
  or dependency-cruiser on the package).

## Inside the main app: `/dev-local-formgraph`

The concrete plug-in demonstration (local-only page, `src/pages/dev-local-formgraph.tsx` in the
worktree root): the SAME definition running in both halves of the real Next app.

- **Server**: `getServerSideProps` calls `generationForm.parse(payload, ext)` inside the Next
  server runtime — the exact call `orchestration-new.service.ts` would make in place of
  `generationGraph.safeParse(normalizeInput(input), externalCtx)`.
- **Client**: `useForm` + `FormProvider` + `Controller` render-props driving REAL Mantine
  components (Select, Textarea, Slider, NumberInput, SegmentedControl) — the identical wiring
  `GenerationForm.tsx` uses for v1's Controllers. Verified live: selecting `txt2img:draft` in
  the Mantine Select runs the reconciler (model → draft build, fluxMode → draft, steps leaves
  the payload) with no hook errors.
- One harness requirement, marked LOCAL-ONLY in `next.config.mjs`: a webpack alias deduping
  react/react-dom, because the prototype's sources resolve react from their own workspace's
  node_modules. Irrelevant post-extraction — an installed npm package resolves the host app's
  react like any dependency.

The swap points this demonstrates, for the eventual migration:
`GenerationFormProvider`'s `useDataGraph` → `useForm` (+ `debouncedStorage`); component
`Controller`s keep their render-prop signature; `useWhatIfFromGraph` reads
`store.output()`/`parsePartial`; the server's `safeParse` call site becomes `parse`, with
`result.notes` replacing the `modelSubstitutions` collector on ctx.

## The complexity audit, and the five mechanism gaps — closed

The prototype form is deliberately smaller than the main app's at SCALE (6 of ~28 workflows,
8 of ~45 ecosystems, ~20 of 49 node keys — the rest is plain fields and table rows in proven
shapes). The audit found five MECHANISMS the covering set hadn't exercised; all five are now in
the form and pinned in `gap-closures.test.ts`:

1. **triggerWords** — a cross-field derivation feeding another field's meta: trained words from
   the checkpoint + resources surface as the prompt editor's chips. In a resolver this is an
   argument (`collectTriggerWords(model, resources)` into `textSection`), not a graph node.
2. **Wan-style intra-leaf ecosystem switching** — 480p/720p are separate ecosystems behind one
   resolution picker. The taxonomy held under its hardest case: resolution→ecosystem is
   selection coupling (a rule); ecosystem→resolution is derivation (projection forces the picker
   to match), so the pair cannot fight — and the locked checkpoint snaps to the new ecosystem's
   default through the existing substitution machinery, notes included.
3. **Ecosystem-level gates** — rule states folded with the self-hosted toggle into one per-item
   map (memberOnly upsell vs disabled vs hidden), hidden removed from options, everything gated
   refused on submit; experimental annotations ride along with stable dismiss ids
   (edited message ⇒ new id ⇒ re-notify).
4. **Images modes** — mode entries on images meta map to workflow keys; selecting one switches
   the workflow and the images shape (first/last slots ⇔ reference images) — LTX img2vid ⇔
   ref2vid.
5. **Priority member-gating** — high priority badged memberOnly/disabled for non-members and
   refused on submit.

## Known gaps (deliberate, phase 1 scope)

- **The generic `Controller<Value, Meta>` still takes explicit generics.** Per-key inference
  exists only through `createTypedController` (the decided registry pattern above); migrating
  call sites onto it is app-side work.
- **Purity is convention.** Nothing stops an impure or expensive resolver.
- **Enumeration needs discriminants to publish `meta.options`.** True of every picker-backed
  field today, but a discriminant driven by something else (a computed like `fluxMode`) has to be
  pinned explicitly, as the tests do with `model`.
- **No differential tests against v1 yet** — that needs the prototype to become a real workspace
  member so it can import `~/shared/data-graph`. Phase 5, and now the largest remaining unknown.
- The demo uses plain HTML inputs on purpose; the `Controller` contract is unchanged, so Mantine
  swaps back in mechanically.

## One ergonomic gotcha worth knowing

A discriminant must be **restated inside its branch**. Objects built before a `switch` keep the
widened type, so `{ ...head, ...branch }` leaves `head.workflow` as the full union and defeats
narrowing. Writing `{ ...head, workflow, ...branch }` — with the narrowed local — fixes it. Cheap,
but invisible until you try to `Extract<>` and get every branch back.
