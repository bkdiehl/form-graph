# form-graph

Branch-routed forms with one definition, both sides.

form-graph is a contract engine for forms whose **shape depends on their own values** — picking
one option changes which fields exist, with defaults, per-branch memory, and coupling rules. You
declare the fields as a graph; TypeScript infers the discriminated union from it; the same
definition IS the client store and parses raw input on the server. No second schema, no drift.

**[Documentation](https://bkdiehl.github.io/form-graph/docs)** ·
**[Live demos](https://bkdiehl.github.io/form-graph/demo)**

```ts
import { z } from 'zod';
import { defineGraph } from 'form-graph';
import { slider, enumOf } from 'form-graph/defs';

// A field is ONE definition — schemas, default, meta, conditions, together.
// Conditional fields are functions of (c, ext); null = doesn't exist this pass.
const graph = defineGraph<{ maxSteps: number }>()
  .field('mode', enumOf({
    options: [
      { value: 'create', label: 'Create' },
      { value: 'upscale', label: 'Upscale' },
    ],
    default: 'create',
  }))
  .field('prompt', {
    input: z.string().optional(),                    // lenient: storage, URLs, raw input
    output: z.string().min(1, 'Prompt is required'), // strict: submit / server parse
    default: '',
  })
  .field('steps', ({ mode, _ext }) =>
    mode === 'create' ? slider({ min: 1, max: _ext.maxSteps, default: 25 }) : null)
  .field('scale', ({ mode }) =>
    mode === 'upscale' ? slider({ min: 2, max: 4, default: 2 }) : null);

// The graph IS the form — the runtime lives on the definition.
const store = graph.createStore({ ext: { maxSteps: 50 } });

// Server: the same pipeline over raw input.
const result = graph.parse(rawBody, { maxSteps: 50 });
```

## Why it exists

General-purpose form libraries assume a static shape. A value-dependent form breaks them: the
branching leaks into every layer as its own copy of the same conditional — a `watch()` here to
hide a field, an `if` in the validator to skip it, an effect to reset it, a guard in the submit
handler. form-graph gives the shape exactly one home — the resolver — and everything else
derives from it: what the UI renders, what the output contains, what validation runs over, and
what the types say.

## What it does that form libraries don't

- **The union is inferred, not annotated.** Each resolver branch returns a different shape;
  consumers narrow with plain `if`/`switch`. Type cost scales with branch *width*, not nesting
  depth — measured linear at 120 branches.
- **Identical output client and server.** `parse()` runs the same resolve → validate pipeline
  the store runs.
- **Scoped, persistent intent.** Choices are remembered per scope (`steps@flux` vs `steps@sd`)
  and survive branch switches — return to a branch and your values are back. The persisted
  format has supported readers, not ad-hoc key parsing.
- **Lenient boundaries, strict output.** Dual schemas per field: stored/remixed/raw values parse
  leniently and fall back to defaults; submit validates strictly, reporting every issue with its
  path. Nothing schema-shaped runs on the keystroke path.
- **Auditable corrections.** `f.correct(key, value, reason)` replaces a value the system
  invalidated — a resolver statement, not a hidden hook — and the reason rides to the server as
  a note on every parse (failures included) and onto the field's snapshot for inline display.
- **Dynamic contracts in zod's own vocabulary.** `refine: (s) => s.refine(...)` narrows a
  field's output schema under the current conditions, deps-cached so typing never constructs a
  schema, with a live per-field error.
- **Cross-field couplings without effect soup.** Rules are records keyed by the triggering
  field, run in one ordered pass per `set()` — cycles are unrepresentable, not detected.
- **Full recompute, isolated renders.** Every change recomputes the whole snapshot; a
  reference-preserving diff means only controls whose data moved re-render.
- **Framework-free core, first-class bindings.** All semantics live in the core store; the
  React and Svelte bindings are each a thin bridge over the same per-field subscriptions.

## Framework bindings

**Svelte** (`form-graph/svelte`):

```svelte
<script lang="ts">
  import { typedFields, Field } from 'form-graph/svelte';
  const store = form.createStore({ ext });
  const f = typedFields(store); // every key, typed from the form — no annotations
</script>

<!-- Placed flat: the FORM decides whether this renders -->
<Field {store} name="steps">
  {#snippet children(snap, setValue)}
    <input type="range" min={snap.meta.min} max={snap.meta.max}
      value={snap.value} oninput={(e) => setValue(Number(e.currentTarget.value))} />
  {/snippet}
</Field>
```

**React** (`form-graph/react`):

```tsx
import { useForm, useTypedField, Controller } from 'form-graph/react';

const store = useForm(form, { ext });
const steps = useTypedField(store, 'steps'); // typed from the form

<Controller name="steps" render={({ value, meta, onChange }) => (
  <Slider min={meta.min} max={meta.max} value={value} onChange={onChange} />
)} />
```

Persistence is one line — JSON web storage, debounced writes, flush on tab close, SSR-safe:

```ts
import { persistedStorage } from 'form-graph';
const store = form.createStore({ ext, storage: persistedStorage('my-form') });
```

## Entry points

| Import | Contents |
| --- | --- |
| `form-graph` | core: `codec`, `defineForm`, `defineRules`, `defineFieldKit`, store, introspection, `persistedStorage`, intent readers |
| `form-graph/svelte` | `typedFields`, `<Field>`, `field`, `formState` |
| `form-graph/react` | `useForm`, `useField`, `useTypedField`, `Controller`, `createTypedController`, `FormProvider` |
| `form-graph/defs` | the definition helpers: sliders, enums, text, booleans — schemas cached automatically |

## Docs and demos

The full documentation and a ladder of live demos are published from this repository:

- **Docs** — [bkdiehl.github.io/form-graph/docs](https://bkdiehl.github.io/form-graph/docs):
  getting started, core concepts, the graph model, rules, server parsing, both bindings.
- **Demos** — [bkdiehl.github.io/form-graph/demo](https://bkdiehl.github.io/form-graph/demo):
  from a teaching form up to a production-scale generation form with dozens of branches,
  verified against its legacy implementation by a differential parity harness.

Locally, `pnpm dev` serves the same site.

## Status

Pre-1.0. The API has been through several deliberate revisions and is settling, but every
release before 1.0 may break it. Battle-testing is ongoing against a large production form
(40+ branch families); the core engine, both bindings, and the persistence layer are covered
by ~310 tests including compile-time type assertions and a 36-case differential parity
suite against the production implementation it replaces.

Engineering history — the design decisions, measurements, and dead ends — lives in
[docs/DEVLOG.md](docs/DEVLOG.md).
