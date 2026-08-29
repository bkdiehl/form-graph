<h1>The graph</h1>

<p>
  <code>defineGraph&lt;Ext&gt;()</code> starts a chain of field definitions. Each entry is the
  whole field; each definition function sees the accumulated context of the fields declared
  above it, plus the external context:
</p>

<pre>{`const graph = defineGraph<Ext>()
  .field('mode', enumOf({ ... }))                    // static definition
  .field('steps', (ctx, ext) =>                      // conditional: a function
    ctx.mode === 'create' ? slider({ min: 1, max: ext.maxSteps }) : null)
  .computed('price', (ctx) => ...)                   // derived, read-only key
  .effect(coupling);                                 // a rules unit riding the graph`}</pre>

<h2>Existence: return null</h2>
<p>
  A definition function returning <code>null</code> means the field does not exist this pass —
  no record, no snapshot, gone from the page (the bindings' <code>&lt;Field&gt;</code> renders
  nothing). The key types optional in <code>ctx</code> and in the state. Intent survives
  deactivation, so the value returns when the field does.
</p>

<h2>Dependencies are the chain</h2>
<p>
  <code>ctx</code> contains exactly the fields declared above — statically. You cannot
  reference a later field, a misspelled field, or a field from another branch; the compiler
  enforces what a dependency graph would, with no dependency graph. Order is visible, cycles
  are unrepresentable.
</p>

<h2>Composition</h2>
<p>Graphs are immutable values. Everything composes with the language:</p>

<pre>{`// shared prefix: keep chaining from a common base
const base = defineGraph<Ext>().field('images', ...).field('model', ...);
const v23 = base.computed('version', () => 'v23' as const).field('resolution', ...);

// shared section: a plain Graph -> Graph function
const withPromptBlock = (g) => g.field('prompt', ...).field('negativePrompt', ...);
const full = withPromptBlock(v23);

// the same section twice, under key prefixes (see the checkout demo)
withAddress(g, 'shipping'); withAddress(g, 'billing', (ctx) => !ctx.sameAsShipping);`}</pre>

<h2>Alternative shapes: the resolver switch</h2>
<p>
  The one thing a chain deliberately does not express: branches that produce DIFFERENT shapes
  with a discriminated union between them (a hub's destinations, a generator's version
  subgraphs). That stays a <code>switch</code> composing whole graphs — each arm's return is
  tagged by the narrowed discriminant, so <code>Extract&lt;State, &#123; version: 'v23'
  &#125;&gt;</code> gives the exact branch shape:
</p>

<pre>{`resolve: (f, ext) => {
  const destination = f.field('destination', DESTINATION);
  switch (destination) {
    case 's3':      return { destination, ...s3Graph.resolve(f, ext) };
    case 'email':   return { destination, ...emailGraph.resolve(f, ext) };
    case 'webhook': return { destination, ...webhookGraph.resolve(f, ext) };
  }
}`}</pre>

<p>
  Rule of thumb: <code>null</code> for fields that come and go within one shape; a switch
  between different shapes. Within a graph, conditional keys are optional; between graphs, the
  union discriminates.
</p>

<h2>Mounting</h2>
<pre>{`export const form = defineForm({
  codecs: graph.codecs,                 // TYPE-complete registry for the bindings
  reconcile: [...graph.effects],        // the rules units the graph carries
  resolve: (f, ext: Ext) => graph.resolve(f, ext),
});`}</pre>
<p>
  <code>graph.resolve</code> is an ordinary resolver fragment — a graph can be a whole form, a
  branch of a hub, or mounted standalone for tests. Underneath, every entry compiles to
  <code>f.field(key, def, options)</code> on the engine; nothing about intent, scoping,
  corrections, the diff, or server <code>parse</code> is graph-specific.
</p>
