<h1>Core concepts</h1>

<h2>Intent, not form state</h2>
<p>
  The store's source of truth is <em>intent</em>: everything the user has ever chosen, keyed by
  address, never deleted when a field deactivates. The visible state is always a pure function of
  intent plus external context. Switch away from a branch and back — your values return, because
  nothing was thrown away.
</p>

<h2>The graph: declaration order is dependency order</h2>
<p>
  A form is a chain of field definitions. Each definition function receives the accumulated
  context of the fields declared <em>above</em> it (plus the external context) — referencing a
  later or nonexistent field is a compile error, so dependencies can never be circular or
  misspelled. Returning <code>null</code> means the field does not exist this pass; the key goes
  optional.
</p>

<pre>{`defineGraph<Ext>()
  .field('mode', enumOf({ ... }))
  .field('steps', (c) => (c.mode === 'create' ? slider({ max: c._ext.maxSteps }) : null))`}</pre>

<p>
  Graphs are immutable values: continuing one with <code>.field()</code> makes a new graph, so a
  shared prefix is ordinary chaining and a shared section is a plain
  <code>Graph → Graph</code> function. The one thing a chain can't express — alternative
  SHAPES with a discriminated union between them — is the <code>branch</code> combinator's job:
  a keyed table of member graphs (see the publish demo's hub).
</p>

<h2>Scoped memory</h2>
<p>
  A definition can declare a <code>scope</code>, and its intent is then remembered per scope
  value — <code>steps&#64;flux</code> and <code>steps&#64;sd</code> are separate memories. This
  is how "the model you picked for Flux" survives a trip through SDXL. Reads fall back to the
  bare key, so unscoped writes (raw server input, remixes) still land.
</p>

<pre>{`// spread onto any def or helper — scope is a field option, not a codec property
.field('model', (c) => ({ ...checkpointDef(c), scope: c.ecosystemGroup }))
.field('steps', (c) => ({ ...slider({ min: 1, max: c.eco === 'flux' ? 2000 : 3000 }), scope: c.eco }))`}</pre>

<h2>Dual schemas and trust</h2>
<p>
  Every value knows where it came from. UI writes are trusted and stored verbatim; boundary
  values (storage, URL, remix, raw server input) run the lenient <code>input</code> schema
  lazily. A lenient schema may REPAIR rather than reject — <code>slider</code>'s input snaps an
  out-of-range value to the nearest step inside the bounds, on the theory that a ceiling that
  moved shouldn't erase the user's setting. Only a value the input schema rejects outright
  falls back to the default (the rejection surfaces as the field's snapshot
  <code>error</code>). Either way, a corrupt stored value can never wedge the form. The strict <code>output</code> schema runs only on demand: submit, <code>output()</code>,
  server <code>parse()</code> — and, with <code>revalidate: 'touched'</code>, on every recompute
  for fields the user has written. The helpers cache schema construction on the exact values a
  schema is built from, so per-pass definitions cost object literals, not zod.
</p>

<h2>When the system disagrees with the user</h2>
<p>Three reactions to an unacceptable value, each stated inside the definition:</p>
<ul>
  <li>
    <strong><code>gate</code></strong> (on <code>enumOf</code>) — availability, declared once:
    the option renders disabled AND a value sitting on it is corrected to the first open option,
    with the gate's string as the reason. For options that are temporarily not offered.
  </li>
  <li>
    <strong><code>correct</code></strong> — the definition's correction policy: inspect the
    resolved value, substitute with a reason. The reason rides to the server as an audit note
    and onto the field's snapshot for inline display; intent is untouched, so the original
    choice returns when conditions do. For mismatches the SYSTEM caused — a retired model, a
    ceiling that moved.
  </li>
  <li>
    <strong>the output schema itself</strong> — a refusal, in zod's own vocabulary: narrow
    <code>output</code> conditionally (<code>.refine(...)</code>, <code>.min(...)</code>,
    anything). The value keeps its place and fails submit with a per-field error — live once
    the user has written it, under <code>revalidate: 'touched'</code>. For mismatches the USER
    must resolve.
  </li>
</ul>

<pre>{`.field('storageClass', (c) => enumOf({
  options: CLASSES,
  default: 'standard',
  gate: { glacier: c.region === 'ap-northeast-1' && 'unavailable_in_region' },
}))

.field('vcpus', (c) => ({
  ...slider({ min: 2, max: 64, step: 2 }),
  meta: { min: 2, max: c._ext.tier === 'pro' ? 64 : 16, step: 2 },
  correct: (v) => (v > 16 && c._ext.tier !== 'pro'
    ? { value: 16, reason: 'tier_limit' }
    : undefined),
}))

.field('hazmatClass', (c) => ({
  ...HAZMAT, // cached base — narrow per pass with refine, never a rebuilt output
  refine: (output) => output.refine((v) => !(v === '1.4' && c.service === 'air'), {
    message: 'Class 1.4 explosives cannot ship by air',
  }),
}))`}</pre>

<h2>Effects (rules)</h2>
<p>
  The one thing that runs on <code>set()</code> instead of during resolve: a rules unit rewrites
  the PATCH before it reaches intent — for couplings between two USER choices, where picking one
  implies the other (the rewritten patch is remembered as if the user chose it). A record keyed
  by the trigger field; one ordered pass per <code>set()</code>, each rule at most once, no
  rewind — cycles are structurally unrepresentable.
</p>

<pre>{`defineGraph()
  .field('model', MODEL)
  .effect({
    // a PLAIN MAP keyed by the trigger field — typed from the graph
    model: (model, { state }) =>
      model?.id === DRAFT_ID && state.workflow !== 'draft' ? { workflow: 'draft' } : undefined,
  });
// rules ride the graph: into a parent via .use, and into its own createStore()/parse()`}</pre>

<p>
  Rule of thumb: an effect when a choice implies another choice; <code>correct</code> when the
  world changed under a choice; the output schema when the choice itself is unacceptable.
</p>

<h2>Render isolation under full recompute</h2>
<p>
  Every pass re-resolves the whole graph, but snapshots preserve references for
  structurally-unchanged fields — so per-key subscribers wake only when their field actually
  changed. Typing in <code>prompt</code> recomputes everything and re-renders one control.
  Measured on the LTX generation graph: ~20µs per keystroke for the full resolve + diff.
</p>

<h2>Reusable definitions</h2>
<p>
  There is no special machinery for reuse — definitions are values and graphs are values:
</p>
<ul>
  <li>a def factory is a function returning a definition (<code>toppingsDef(budget)</code>);</li>
  <li>a section is a <code>Graph → Graph</code> function (<code>withContact(g)</code>);</li>
  <li>
    the same section mounts twice under key prefixes (<code>withAddress(g, 'shipping')</code>,
    <code>withAddress(g, 'billing', when)</code>) — see the checkout demo.
  </li>
</ul>
