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
  .field('steps', (ctx, ext) => (ctx.mode === 'create' ? slider({ max: ext.maxSteps }) : null))`}</pre>

<p>
  Graphs are immutable values: continuing one with <code>.field()</code> makes a new graph, so a
  shared prefix is ordinary chaining and a shared section is a plain
  <code>Graph → Graph</code> function. The one thing a chain can't express — alternative
  SHAPES with a discriminated union between them — stays a <code>switch</code> in the resolver,
  composing whole graphs per branch (see the publish demo's hub).
</p>

<h2>Scoped memory</h2>
<p>
  A definition can declare a <code>scope</code>, and its intent is then remembered per scope
  value — <code>steps&#64;flux</code> and <code>steps&#64;sd</code> are separate memories. This
  is how "the model you picked for Flux" survives a trip through SDXL. Reads fall back to the
  bare key, so unscoped writes (raw server input, remixes) still land.
</p>

<pre>{`.field('model', (ctx) => ({ ...checkpointDef(ctx), scope: ctx.ecosystemGroup }))`}</pre>

<h2>Dual schemas and trust</h2>
<p>
  Every value knows where it came from. UI writes are trusted and stored verbatim; boundary
  values (storage, URL, remix, raw server input) run the lenient <code>input</code> schema
  lazily, falling back to the default on failure — a corrupt stored value can never wedge the
  form. The strict <code>output</code> schema runs only on demand: submit, <code>output()</code>,
  server <code>parse()</code>. The helpers cache schema construction on the exact values a
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
    anything). The value keeps its place, carries a LIVE error, and fails submit. For mismatches
    the USER must resolve.
  </li>
</ul>

<pre>{`.field('storageClass', (ctx) => enumOf({
  options: CLASSES,
  default: 'standard',
  gate: { glacier: ctx.region === 'ap-northeast-1' && 'unavailable_in_region' },
}))

.field('vcpus', (ctx, ext) => ({
  ...slider({ min: 2, max: 64, step: 2 }),
  meta: { min: 2, max: ext.tier === 'pro' ? 64 : 16, step: 2 },
  correct: (v) => (v > 16 && ext.tier !== 'pro'
    ? { value: 16, reason: 'tier_limit' }
    : undefined),
}))

.field('hazmatClass', (ctx) => ({
  ...HAZMAT,
  output: hazmatOutput.refine((v) => !(v === '1.4' && ctx.service === 'air'), {
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

<pre>{`const coupling = defineRules<void, { ecosystem?: string }>({
  scope: (state) => state.ecosystem === 'Flux1',   // guard: fire only in this region
  rules: () => ({
    model: (model, { state }) =>
      model?.id === DRAFT_ID && state.workflow !== 'draft' ? { workflow: 'draft' } : undefined,
  }),
});

defineGraph().field(...).effect(coupling)          // rides the graph
// or: defineForm({ ..., reconcile: [coupling] })`}</pre>

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
