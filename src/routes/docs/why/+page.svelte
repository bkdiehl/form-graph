<h1>Why form-graph</h1>

<p>
  This library started from a simple frustration: building complex forms shouldn't mean managing
  a mountain of conditionals and spaghetti logic. One specific kind of form breaks every
  general-purpose form tool — a form whose <em>shape depends on its own values</em>. The
  motivating case is an AI generation form: picking a workflow changes the available ecosystems,
  picking an ecosystem changes which model, sampler, and size fields exist, and picking a model
  can change the workflow right back. Each section below is a problem that shape actually
  produced in production, and the mechanism here that answers it.
</p>

<h2>Problem: the conditionals end up everywhere</h2>
<p>
  With a general-purpose form library, a value-dependent form has no single home for its shape.
  The branching leaks into every layer as its own copy of the same conditional: a
  <code>watch()</code> in this component to hide a field, an <code>if</code> in the validator to
  skip it, an effect over there to reset it, another guard in the submit handler because the
  hidden field's value is still in the state object. Fifty fields deep, no one can answer "what
  does this form look like when mode is X?" without reading all of it — and every new branch adds
  another scattering.
</p>
<p>
  <strong>How it's solved:</strong> the shape has exactly one home — the resolver. It's a plain
  function that declares which fields exist for the current values; the branch <em>is</em> a
  <code>switch</code> statement, readable top to bottom. Everything else derives from that single
  declaration: the UI renders the fields the resolver returned (no hide/show bookkeeping), the
  output contains only those fields (no submit-time scrubbing), validation runs only over them,
  and the types narrow to match. The conditionals don't disappear — they collapse into the one
  place where they read as structure instead of spaghetti.
</p>

<h2>Problem: the type system gives out before the form does</h2>
<p>
  Model a branching form as composed schemas — discriminated unions of zod objects, graphs merged
  into graphs — and the compiler pays for <em>nesting</em>. Every merge wraps the previous type
  one level deeper, and at real scale (dozens of workflows × ecosystems) TypeScript stops with
  "type instantiation is excessively deep" (TS2589). At that point you can't add the next branch,
  and the type that was the whole point becomes the obstacle.
</p>
<p>
  <strong>How it's solved:</strong> branches aren't modeled <em>in</em> the type system — they're
  modeled in code, and the type system <em>observes</em> them. The resolver is a plain function
  with a <code>switch</code>; each arm returns a different object literal; the inferred return
  type IS the discriminated union. Cost scales with the number of branches (width), not with how
  they compose (depth). Adding branch fifty is the same compile cost as adding branch five —
  measured, not hoped.
</p>

<h2>Problem: the client and the server disagree about the contract</h2>
<p>
  The usual split — a form library on the client, "also run zod" on the server — is two
  implementations of one contract, and they drift. A default added on one side, a migration
  applied on the other, an aspect-ratio table trimmed differently: each drift is invisible until a
  submission the UI considered valid is rejected, or worse, accepted with different values.
</p>
<p>
  <strong>How it's solved:</strong> there is one definition, and <code>form.parse(raw, ext)</code>
  runs the exact pipeline the client store runs — boundary codecs, resolution, rules, strict
  output validation. The server doesn't approximate the form; it executes it. Building this
  library, a differential harness ran the same inputs through the legacy graph and this engine —
  the drifts it caught (a default only an effect applied, a dimension table that resolved
  '16:9' to '3:2') are exactly the class this design deletes.
</p>

<h2>Problem: switching branches destroys the user's work</h2>
<p>
  A user tunes steps and cfg for one model family, tries another, comes back — and everything
  reset, because the form state only held the fields that currently exist. Teams patch this with
  ad-hoc localStorage keys per field, which then become an undocumented persistence format that
  UI code reads raw.
</p>
<p>
  <strong>How it's solved:</strong> state is split from <em>intent</em>. Intent is everything the
  user ever chose, keyed by address, never deleted when a branch deactivates; visible state is a
  pure function of intent. A field can declare a <code>scope</code>, so its memory is
  per-branch or per-group (<code>steps&#64;flux</code> vs <code>steps&#64;sd</code>) — return to
  a branch and its values return with it. The persisted format is the intent record itself, with
  supported readers (<code>readIntentValue</code>/<code>readIntentBuckets</code>) instead of raw
  key parsing.
</p>

<h2>Problem: one stale stored value wedges the whole form</h2>
<p>
  Anything that persists user choices eventually reloads a value the current config no longer
  accepts — a retired model id, a removed workflow key, a corrupt JSON blob. Validate strictly on
  load and the form errors before the user touches it; skip validation and garbage flows into
  submissions.
</p>
<p>
  <strong>How it's solved:</strong> every value knows where it came from. UI writes are trusted
  and stored verbatim. Boundary values — storage, URLs, remixes, raw server input — run a
  separate <em>lenient</em> input schema, lazily, falling back to the field's default on failure.
  The <em>strict</em> output schema runs only on demand: submit, <code>output()</code>, server
  parse. A corrupt stored value can cost the user one field's memory; it can never wedge the
  form. And because nothing zod-shaped runs during typing, keystrokes stay flat regardless of
  form size.
</p>

<h2>Problem: silent corrections you can't audit</h2>
<p>
  Real forms correct user values: clamp a quantity to the account's limit, substitute a retired
  checkpoint for the current default, force the locked model for a draft workflow. Do it silently
  and the server can't tell a correction from a tampered request; error instead and you punish
  users for config changes they never saw.
</p>
<p>
  <strong>How it's solved:</strong> corrections are a first-class field behavior —
  <code>project</code> — distinct from refusal (<code>validate</code>). A projection can attach a
  note with a machine-readable <em>reason</em> (<code>locked_default</code>,
  <code>ecosystem_mismatch</code>, …), and notes ride on every parse result, failures included.
  The server doesn't diff blindly; it reads why a value moved.
</p>

<h2>Problem: cross-field couplings become effect soup</h2>
<p>
  "Selecting the draft workflow forces the draft model, and selecting the draft model forces the
  draft workflow" — written as reactive effects, that's two watchers with mutual guards, ordering
  dependencies on the store, and a cycle waiting for the guard someone deletes.
</p>
<p>
  <strong>How it's solved:</strong> couplings are <code>defineRules</code> records keyed by the
  field whose change triggers them. Rules rewrite the patch <em>before</em> resolution, in one
  ordered pass per <code>set()</code>, each rule at most once, no rewind — cycles aren't detected,
  they're unrepresentable. The driver is whichever field the user actually touched, so
  "workflow sets model" and "model sets workflow" coexist without ever chasing each other.
</p>

<h2>Problem: recompute-everything re-renders everything</h2>
<p>
  Deriving the whole form on every keystroke is the simplest correct model — and naively it means
  every control re-renders on every keystroke, which is exactly why large forms lag. The usual
  escape is incremental recomputation, which trades the simplicity away for dependency-tracking
  machinery.
</p>
<p>
  <strong>How it's solved:</strong> keep the full recompute, fix the notification. The snapshot
  diff is reference-preserving — a field whose data didn't change keeps its exact object
  identity, and its per-field subscribers never fire. Typing in the prompt recomputes everything
  and wakes one control. The same reference guarantee is what makes the Svelte and Vue reactivity
  models work unmodified.
</p>

<h2>Problem: the form logic is welded to one UI framework</h2>
<p>
  When the contract engine lives inside React hooks, the server can't run it, tests need a DOM,
  and a second frontend means a rewrite.
</p>
<p>
  <strong>How it's solved:</strong> every semantic — resolution, rules, intent, diffing,
  validation — lives in a framework-free core with a subscribe/snapshot store. The React and
  Svelte bindings are each a few dozen lines bridging that store into their reactivity system,
  and the <a href="/demo">demos</a> run the same definition SvelteKit-server-side that a React
  app would run in the browser.
</p>

<h2>What this is not</h2>
<p>
  form-graph is a contract engine, not a UI kit. It has no field-array choreography, no wizard
  steps, no focus management — a form whose shape is static and whose fields are independent is
  well served by the established form libraries, and pairing one of them with a single
  form-graph array field is a supported pattern, not a workaround. The scope line: if a feature
  changes what the parsed output <em>means</em> or how a value is <em>remembered</em>, it belongs
  here; if its subject is how the user moves through the UI, it doesn't.
</p>
