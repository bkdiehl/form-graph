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
    the key is inactive in the current branch.
  </li>
  <li><code>getNotes()</code> — this resolution's notes (corrections and advisories).</li>
  <li><code>getIntent()</code> — the raw intent record, scoped addresses included.</li>
  <li><code>getComputedKeys()</code> — the derived keys in the active branch.</li>
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
    form's <code>reconcile</code> rules, lands in intent (through each codec's input schema),
    and triggers a resolve.
  </li>
  <li>
    <code>setExt(ext)</code> — replace the external context wholesale; the form re-resolves.
    Ext is never mutated in place — the store cannot see mutation.
  </li>
  <li>
    <code>reset(&#123; exclude &#125;)</code> — clears intent. Excluded KEYS keep everything
    they've accumulated, every scoped bucket included.
  </li>
  <li><code>prune(predicate)</code> — delete intent entries by address, for targeted cleanup.</li>
</ul>

<h2>Getting data out</h2>
<pre>{`const result = store.validate();   // { success, data | errors } — the checked path
const state  = store.output();     // State — THROWS naming the failing keys
const part   = form.parsePartial(raw, ext); // best-effort: per-key results, no throw`}</pre>
<p>
  <code>validate()</code> is for submit flows that render errors; <code>output()</code> is for
  call sites that have already validated and want the narrowing; <code>parsePartial</code> is
  for progressive server handling. Server-side <code>form.parse(raw, ext)</code> is the same
  pipeline over a raw record — one behavior, client and server.
</p>


