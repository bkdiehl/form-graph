# form-graph × the civitai training form — fit map

A pitch document: each thing the training form actually does today, mapped to the
form-graph mechanism that would carry it. Grounded in an inventory of the current
implementation (2026-09-07), not the library's marketing.

## What the form is today

A 3-step wizard (`?step=N`): basic info → dataset upload/labeling → training params +
submit. Step 1 is react-hook-form + zod; **steps 2 and 3 use no form library at all** —
raw Mantine inputs wired to a bespoke zustand store (`src/store/training.store.ts`,
669 lines), with validation split across three disconnected places (a step-1 zod schema,
a ~100-line imperative gauntlet in `TrainingSubmit.tsx`, and the server's discriminated
union in `training.schema.ts`). There is no draft persistence: the store is in-memory,
keyed by modelId, and reload-hydration is hand-rebuilt from DB rows.

The rewrite target is **~6,000 lines of form logic**, of which ~950 is already a
declarative field catalogue (`trainingSettings` in `TrainingParams.tsx`) and ~670 is
the store a form library would subsume. The genuine complexity is four things: the
~35-base-model × 7-engine override matrix, nine imperative coupling effects, the
multi-run array (max 5), and the whatif-cost response that writes back into form state.

## Need → mechanism

| The form needs | It has today | form-graph mechanism |
| --- | --- | --- |
| Params conditional on base model + engine | `overrides[baseModel][engine]` matrix resolved by `getDefaultTrainingParams`, applied by effects | A def factory `paramDef(name, base, engine)` reading the same matrix — the matrix is already pure data and ports as-is. Defaults, min/max, disabled, hint all live on the def |
| Param values remembered per engine/base ("switch back and your tuning returns") | Lost today — engine change wipes params to defaults, guarded by a confirm modal | Scoped intent: `scope: \`${base}/${engine}\`` on the param defs. Switching engines shows that engine's defaults; switching back restores the user's tuning. The confirm modal becomes unnecessary |
| Multiple training runs (max 5), add/duplicate/remove | `runs: TrainingRun[]` in zustand, hand-merged `updateRun`, `maxRuns = 5` | `list('runs', runGraph, { min: 1, max: 5 })` — per-run branches, per-run errors, per-run persistence, stable ids, refusals at the bounds. `duplicate()` is built in |
| Derived read-only fields (`targetSteps` from epochs×repeats×batch÷images) | `useEffect` chains recomputing on each input | `.computed` — a pure derivation in the graph, never an effect |
| Option filtering (Prodigy removes a scheduler; video removes an optimizer) | Imperative filtering in `buildRow` | `gate` on `enumOf` — the option renders disabled and a value sitting on it is corrected away, with a reason |
| Forced values (Prodigy → `unetLR=1`; disabled `textEncoderLR` → 0; `keepTokens` bumped with a toast) | Effects + toast notifications | `correct: (v) => ({ value, reason })` — the reason rides onto the field snapshot for inline display (better than a toast) and to the server as an audit note |
| Step gates ("Next" validates only this step) | Step 1: RHF submit; step 3: the imperative gauntlet | `store.validate(step.keys)` — a key list next to the step's UI; inactive branch arms vacuously valid; the whole `runs` list is a single step-3 gate |
| Async cost estimation (whatif → buzzCost/licenseFee/hasIssue written into the run) | Debounced query + `useEffect` writing the response into zustand | The price is not user intent — it's context. `setExt` with the whatif results; computed fields read it. `hasIssue` → `setError('runs[id].…')`, live on the run, fails validate, never persisted |
| Server-side validation matching the client | Three disconnected zod surfaces + `formatTrainingValidationError` re-humanizing server errors | One graph; `form.parse(raw, ext)` runs the identical pipeline server-side. The re-humanizer disappears because the errors are already field-keyed |
| Draft persistence across reload | None — in-memory store + hand-rolled DB rehydration refs | `persistedStorage('training:' + modelId)` — one line, path-keyed, rows/values/order survive reload (the invoice demo shows exactly this) |
| Dirty detection (params-changed-from-defaults, guarded resets) | Hand-diffed against defaults with a skip-list | `isDirty()` / `dirtyFields()` — the intent map is the dirty tracker |
| Cross-field couplings that remain genuinely event-shaped | Nine `useEffect` chains with guards and ordering dependencies | `.effect` rule maps — one ordered pass per `set()`, cycles unrepresentable. See the dissolution below: most of the nine don't survive as effects at all |

## The nine couplings, dissolved

Most of today's effect soup isn't couplings — it's defaults, derivations, and scoped
memory wearing effect costumes. Mapped one-to-one:

1. Engine change → reset params to defaults → **scoped intent + def factory** (no effect)
2. `targetSteps` derivation → **`.computed`**
3. `saveEvery` clamped derivation → **`.computed`** (or `correct` if it must stay editable)
4. Optimizer → args map + Prodigy LR forcing, un-forced on switch away → **defaults per
   optimizer + `scope: optimizerType`** — per-optimizer memory gives the un-forcing for free
5. Disabled `textEncoderLR` → force 0 → **`correct`**
6. `shuffleCaption` + trigger word + `keepTokens=0` → bump to 1 → **`correct`** with reason
7. Prefill `samplePrompts` from labels → **default derived from ext** (labels are context)
8. Flag-driven default engine, once per run → **a default** (flags are ext)
9. Base-model change → applyDefaultParams + confirm-if-dirty modal → **scoped intent
   makes the reset unnecessary**; if the modal is still wanted, `dirtyFields()` feeds it

What survives as an actual `.effect` rule: possibly nothing; at most one or two genuine
user-choice-implies-user-choice couplings.

## What stays outside (and should)

The dataset step's upload machinery is not form-shaped and no form library should touch
it: drag/drop, zip/S3 multipart state, per-image label editing, the auto-label job UI,
signal plumbing (~5,100 lines, explicitly out of scope). The borderline pieces that ARE
form-shaped and currently live inside the upload page — trigger word, label type,
`ownRights`/`shareDataset`, the attestation checkbox — can be a small graph of their own.

Submission orchestration (per-run version creation, rollback on failure) stays app code:
form-graph produces the validated payload; the app owns the submit.

## Honest risks

- **Member-graph effects don't merge into the parent** (documented limit of `list()`).
  Per the dissolution above this likely never bites — the per-run couplings become defs,
  which DO run per element — but if a genuine rule is needed inside the run graph, that
  limit gets closed first. It's a known, scoped piece of work, not a surprise.
- **The submit wire format is the intent record**: `parse(store.getIntent(), ext)`
  round-trips scoped buckets and lists losslessly (pinned by tests). Ingesting an
  array-of-objects `runs` payload from a NON-form-graph caller still needs a small
  adapter (documented follow-up) — irrelevant when the client is the form itself.
- **Pre-1.0 API.** Mitigation: the 0.4 surface is settled and pinned by a public-surface
  test; breaking changes go through Briant; and the generation-form differential harness
  (12,432 cases) gates releases against the flagship consumer.

## The port method

Proven on the generation form (see `docs/proposal-0.4.md` §4 and the `form-graph-port`
skill in the civitai repo): oracle-first. Extract the current mappers into pure
functions, freeze golden fixtures, build the graph, and run a differential harness —
old path vs `parse()` — until byte-equal. The training form is friendlier than the
generation form was: its field catalogue is already declarative data, and its override
matrix ports without transformation.

Live worked examples of every mechanism above: the invoice demo (lists, setError,
scoped validate, dirty pill, path-keyed persistence) and the wizard demo (step gates,
`revalidate: 'touched'`, `focusFirstError`) at bkdiehl.github.io/form-graph/demo.
