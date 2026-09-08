<script lang="ts">
  import { base } from '$app/paths';
</script>

<h1>The store</h1>

<p>
  <code>form.createStore(options)</code> is the client runtime: it holds intent, re-resolves on
  every change, and hands out snapshots whose references are preserved for
  structurally-unchanged fields — which is what makes per-field subscriptions cheap.
</p>

<pre>{`const store = form.createStore({
  ext,                                        // required iff the form declares an Ext
  storage: persistedStorage('my-form'),       // optional persistence (see Storage)
});`}</pre>

<h2>Reading</h2>
<ul>
  <li><code>getSnapshot()</code> — <code>&#123; state, keys, fields &#125;</code> for the active branch.</li>
  <li><code>getState()</code> — the resolved state object alone.</li>
  <li>
    <code>getField(key)</code> — one field's snapshot (<code>value</code>, <code>meta</code>,
    <code>error</code>, <code>note</code>, <code>isComputed</code>), or <code>null</code> while
    the key is inactive in the current branch. In the core, <code>value</code> is
    <code>unknown</code> and <code>meta</code> untyped — per-key types live in the bindings
    (<code>typedFields</code>, <code>useTypedField</code>, the svelte
    <code>field&lt;T, M&gt;</code> helper); headless code casts or goes through those.
  </li>
  <li><code>getNotes()</code> — this resolution's notes (corrections and advisories).</li>
  <li>
    <code>getIntent()</code> — DURABLE intent (adopted defaults filtered), scoped addresses
    included; also the submit wire format (see Server parsing).
  </li>
  <li><code>getComputedKeys()</code> — the derived keys in the active branch.</li>
  <li>
    <code>isDirty()</code> / <code>dirtyFields()</code> — what the user has WRITTEN this
    session (scope-collapsed field keys; list element paths as paths). Adopted defaults and
    storage-loaded values are the baseline, not dirt. Deliberate divergence from
    react-hook-form: typing the default back STAYS dirty — the write exists; we don't
    deep-compare defaults.
  </li>
</ul>

<h2>Subscribing</h2>
<pre>{`const off = store.subscribe(() => rerender());        // whole-form
const offOne = store.subscribe('steps', onSteps);      // one key only`}</pre>
<p>
  A per-key subscriber fires only when that field's snapshot reference changes. Typing in
  <code>prompt</code> recomputes the whole form, but only <code>prompt</code>'s subscribers
  wake. The framework bindings are thin wrappers over exactly this.
</p>

<h2>Writing</h2>
<ul>
  <li>
    <code>set(patch)</code> — the one write path for user input. The patch runs through the
    form's <code>reconcile</code> rules, lands in intent (through each definition's input schema),
    and triggers a resolve.
  </li>
  <li>
    <code>setExt(ext)</code> — replace the external context wholesale; the form re-resolves.
    Ext is never mutated in place — the store cannot see mutation. A deep-equal ext is a
    no-op, so pushing unconditionally from a reactive source is free (see the Svelte
    binding's <code>syncExt</code>).
  </li>
  <li>
    <code>reset(&#123; exclude &#125;)</code> — clears intent, surfaced and external errors, and touched state. Excluded KEYS keep everything
    they've accumulated, every scoped bucket included.
  </li>
  <li><code>prune(predicate)</code> — delete intent entries by address, for targeted cleanup.</li>
</ul>

<h2>When errors surface: <code>revalidate</code></h2>
<pre>{`const store = form.createStore({ ext, revalidate: 'touched' });`}</pre>
<p>
  Default (<code>'submit'</code>): refine/output failures show only at
  <code>validate()</code>/<code>parse</code> — a pristine required field never scolds.
  <code>'touched'</code>: a field the user has WRITTEN is judged on every recompute — new
  failures surface live and lift live, still only for touched fields, so pristine fields
  stay quiet in both modes. Touched means <em>written</em>: the store is UI-blind, so blur is
  not a store concept (a binding can layer blur-based touch later if needed). Cost, measured:
  the worst case — every field of a 35-field form touched — adds ~6µs to a keystroke.
</p>

<h2>External errors: async judgments in a sync engine</h2>
<pre>{`store.setError('triggerWord', { message: 'This phrase is not allowed.' });
store.clearError('triggerWord');`}</pre>
<p>
  Resolution stays synchronous; async results enter as VALUES through <code>set</code>/ext, and
  as VALIDITY through <code>setError</code> — a server-side audit refusing a field, a cost check
  failing a row. An external error is live on the field's snapshot, wins over an engine error on
  the same key, fails <code>validate()</code>/<code>output()</code>, and is never persisted.
  Staleness the engine owns: a user write to the field clears it, the field leaving the active
  branch drops it, and <code>setError</code> against an inactive key binds nothing. Everything
  else — clearing on a new request, choosing which async result wins — is your code, where you
  already know the answer.
</p>

<h2>Getting data out</h2>
<pre>{`const result = store.validate();   // { success, data | errors } — the checked path
const data   = store.output();     // Data — same shape as parse().data; THROWS naming failing keys
const part   = form.parsePartial(raw, ext); // best-effort: per-key results, no throw`}</pre>
<p>
  <code>validate()</code> is for submit flows that render errors; <code>output()</code> is for
  call sites that have already validated and want the narrowing; <code>parsePartial</code> is
  for progressive server handling. Server-side <code>form.parse(raw, ext)</code> is the same
  pipeline over a raw record — one behavior, client and server.
</p>

<h2>Scoped validation: wizard steps</h2>
<pre>{`store.validate();                    // the whole active graph
store.validate('triggerWord');       // one field
store.validate(STEP2_KEYS);          // a step's fields — a wizard "Next"
store.validate('runs');              // a whole list, every element`}</pre>
<p>
  The scoped form judges ONLY the named fields — surfacing and clearing errors for them alone,
  so a step's "Next" can't scold (or absolve) a later step. Keys are typed against the graph;
  an inactive key is vacuously valid, which is what lets one key list cover every branch arm. A
  list key expands to all its elements. The scoped result is
  <code>&#123; success &#125;</code> or <code>&#123; success: false, errors &#125;</code> —
  deliberately without <code>data</code>: a scoped success vouches only for the named fields.
  The graph itself stays step-agnostic; which keys form a step is your business, declared next
  to the step's UI (see the <a href="{base}/demo/wizard">wizard demo</a>). After a failed step
  validate, <code>focusFirstError(store, keys)</code> jumps to the first offender — see the
  bindings' <code>fieldProps</code>.
</p>

<h2>Lists</h2>
<pre>{`const runs = store.list('runs');     // throws for an inactive/unknown key
runs.ids                              // element ids, in order
runs.add({ engine: 'musubi' })        // { success: true, id } — seed writes member fields
runs.remove(id)                       // { success: false, reason: 'min' } at the bound
runs.duplicate(id)                    // copies USER-WRITTEN entries; derived values re-derive
runs.move(id, index)`}</pre>
<p>
  The ops handle for a <code>list()</code> field (see Collections). Bounds REFUSE rather than
  break: the store never holds an invalid membership, and a refusal carries its
  <code>reason</code>. Element fields read and write through their dotted paths
  (<code>store.set(&#123; 'runs[a1b2].engine': 'musubi' &#125;)</code>) — every store mechanism
  on this page is path-aware.
</p>


