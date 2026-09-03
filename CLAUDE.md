# form-graph

A standalone npm library: branch-routed forms with one definition serving both the client
store and server parsing. This repo is the library (`src/lib`), its docs site + live demos
(`src/routes`), an engine-level integration corpus (`src/lib/generation`), and v1 porting
scratch (`src/v1`). The flagship consumer is civitai's generation form
(`C:\work\worktrees\form-graph-port`, `src/shared/form-graph/generation`) — breaking
changes here must land there in the same working session.

## Commands

```bash
pnpm run typecheck            # tsc over the lib (tsconfig.lib.json)
pnpm run check                # svelte-check over routes/docs/demos
pnpm run test                 # vitest, the whole suite
pnpm run prepack              # svelte-package -> dist + publint
pnpm run check:types-budget   # type-instantiation budget guard
pnpm run release[:minor|:major]  # version bump + publish + push (user-run only)
```

**A `link:`-consumer sees `dist`, not `src` — run `pnpm run prepack` after every lib edit**
or the consumer silently runs stale code. `prepublishOnly` runs typecheck + check + tests,
so a release cannot skip the battery.

**Releases are the user's action.** Pre-1.0 semver: breaking changes bump the **minor**
(`^0.x` ranges don't cross minors), patch is for fix-only.

## Design invariants (each was litigated — don't relitigate silently)

- **One `branch` combinator, two forms.** Keyed (`.field(key, def)` then
  `branch(key, pairsTable)`) and tagged (`branch(key, pick, members, opts?)`). There is
  deliberately **no untagged form and no `branchOn`**: a pick function's control flow is
  invisible to the type system, so dispatch must ride a declared field or a tag. The
  design trail is in `docs/DEVLOG.md`.
- **Resolution is synchronous.** Async work happens outside the graph and enters via ext.
  Considered and rejected — see the DEVLOG entry before proposing async resolvers.
- **The lib owns the grammar; the consumer owns policy.** `scopedAddress` /
  `readIntentValue` / `readIntentBuckets` exist so outsiders never hand-parse or hand-glue
  intent addresses — but migration logic, field selection, and storage layout decisions
  belong in consumer code. Don't add migration APIs here.
- **`computedKeys` on a parse result are WIRE-named computeds** (an `emit:false` computed
  is not listed — it isn't in `data`). Consumers use it to strip derived values from
  persisted params; changing its semantics breaks remix on civitai.
- **Type cost is budgeted.** Run `check:types-budget` after type-level changes; for
  anything on the `branch`/inference path, measure instantiations before and after
  (`tsc --extendedDiagnostics`, delete `tsconfig.tsbuildinfo` first for a cold number).

## Conventions

- **DEVLOG.md records design decisions, including rejected ones.** A change of API shape
  without a DEVLOG entry is incomplete. Historical entries describe the API of their
  time — don't "fix" them.
- **The public surface is pinned** in `core/__tests__/public-surface.test.ts` — an
  export change fails the suite until the list is updated in the same commit, which
  is also when the DEVLOG entry and docs section get written. Prefer promoting an
  existing internal over inventing new surface.
- **Docs and demos ship with the API.** New exports get a section in the matching
  `src/routes/docs/*` page; a changed combinator updates the demos that use it. The doc
  pages are the contract consumers read — an undocumented export effectively doesn't
  exist (the Infer types shipped undocumented for weeks and their consumer rediscovered
  the need from scratch).
- `src/lib/generation` is the engine-level corpus, NOT authoring guidance — its README
  says so; keep it compiling but don't imitate it in docs.
