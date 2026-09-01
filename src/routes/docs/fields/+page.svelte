<h1>The graph</h1>

<p>
  <code>defineGraph&lt;Ext&gt;()</code> starts a chain of field definitions. Each entry is the
  whole field; each definition function receives ONE bag — the fields declared above it,
  spread at top level so you destructure exactly what you read, plus the external context
  under the reserved key <code>_ext</code>:
</p>

<pre>{`const graph = defineGraph<Ext>()
  .field('mode', enumOf({ ... }))                    // static definition
  .field('steps', ({ mode, _ext }) =>                // conditional: a function
    mode === 'create' ? slider({ min: 1, max: _ext.maxSteps }) : null)
  .computed('price', ({ size, toppings }) => ...)    // derived, read-only key
  .effect(coupling);                                 // a rules unit riding the graph`}</pre>

<h2>Existence: return null</h2>
<p>
  A definition function returning <code>null</code> means the field does not exist this pass —
  no record, no snapshot, gone from the page (the bindings' <code>&lt;Field&gt;</code> renders
  nothing). The key types optional in <code>c</code> and in the state. Intent survives
  deactivation, so the value returns when the field does.
</p>

<h2>Dependencies are the chain</h2>
<p>
  <code>c</code> contains exactly the fields declared above — statically. You cannot
  reference a later field, a misspelled field, or a field from another branch; the compiler
  enforces what a dependency graph would, with no dependency graph. Order is visible, cycles
  are unrepresentable.
</p>

<h2>Composition</h2>
<p>Graphs are immutable values. Everything composes with the language:</p>

<pre>{`// shared prefix: keep chaining from a common base
const base = defineGraph<Ext>().field('images', ...).field('model', ...);
const v23 = base.computed('version', () => 'v23' as const).field('resolution', ...);

// shared section: another graph, mounted with .use (see Reuse)
const promptBlock = defineGraph<Needs>().field('prompt', ...).field('negativePrompt', ...);
const full = v23.use(promptBlock);

// the same section twice, under key prefixes (a function via .use — see the checkout demo)
g.use((g) => withAddress(g, 'shipping'));`}</pre>

<h2>Alternative shapes: hubs</h2>
<p>
  The one thing a chain deliberately does not express: branches that produce DIFFERENT shapes
  with a discriminated union between them (a hub's destinations, a generator's version
  subgraphs). Two combinators structure that hub. <code>branchOn</code> declares the
  discriminator FIELD itself and dispatches on it:
</p>

<pre>{`const publish = branchOn('destination', DESTINATION, {
  s3: s3Graph, email: emailGraph, webhook: webhookGraph,
});
// State = { destination: 's3' } & S3Ctx | { destination: 'email' } & EmailCtx | ...
// Extract<State, { destination: 's3' }> is exactly the s3 shape`}</pre>

<p>
  <code>branch</code> dispatches on a value DERIVED from external context instead — the shape
  of a version-family form, where the ecosystem picks the subgraph:
</p>

<pre>{`export const wan = branch(
  'wanVersion',                                // tag: the picked MEMBER KEY lands
  (ext: WanExt) => versionOf(c._ext.ecosystem),   //   in state under this key
  { 'v2.1': v21, 'v2.2': v22, 'v2.5': v25 }
).effect(({ patch, state, next }) => { ... }); // the family's coupling, inline
// Extract<State, { wanVersion: 'v2.5' }> is exactly that member's shape —
// no member re-declares which member it is. Omit the tag for an untagged hub.`}</pre>

<p>
  Either way the hub is the same shape a graph is: <code>defs</code> holds every member's
  registry merged (type-complete, so the bindings know every key), <code>effects</code> holds
  every member's rule units plus the hub's own, and <code>resolve</code> returns the
  discriminated union. A hand-written <code>switch</code> composing whole graphs remains the
  escape hatch when dispatch is more than one key.
</p>

<p>
  Rule of thumb: <code>null</code> for fields that come and go within one shape; a hub
  between different shapes. Within a graph, conditional keys are optional; between graphs, the
  union discriminates.
</p>

<h2>“Mutually dependent” fields are a modeling smell</h2>
<p>
  A graph resolves once, in declaration order — a cycle is unrepresentable ON PURPOSE.
  When two fields seem to need each other, the domain almost always contains a hidden
  DERIVED value conflated into one of them (a stored “ecosystem” that is really
  <em>user selection + a backend target computed from resolution</em>). Split them: keep
  the SELECTION as the field, and derive the target where its inputs already exist — a
  later definition function, a computed, or the submission boundary. The dependency
  order was the design telling you the field was two facts wearing one key.
</p>

<h2>The runtime is on the definition</h2>
<pre>{`const store = graph.createStore();       // client
const result = graph.parse(rawBody);      // server — the same pipeline`}</pre>
<p>
  Hubs carry the same runtime: <code>publish.createStore()</code>. Underneath, every entry
  compiles onto a resolver engine; nothing about intent, scoping, corrections, the diff, or
  server <code>parse</code> is graph-specific. The engine itself is not exported — every form,
  the generation-scale hub included, is expressible as a graph (proven by the differential
  parity suite), so graphs are the only authoring surface.
</p>
