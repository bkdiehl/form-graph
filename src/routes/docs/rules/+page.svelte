<h1>Effects (rules)</h1>

<p>
  Everything else in the library runs during resolve. Effects run on <code>set()</code>: they
  rewrite the PATCH before it reaches intent — the home for couplings between two USER choices,
  where picking one implies the other. The rewritten patch is remembered as if the user chose
  it; that's the defining difference from a definition's <code>correct</code>, which never
  touches intent.
</p>

<h2>The common case: a plain map on <code>.effect()</code></h2>
<p>
  Rules are a record keyed by the TRIGGER field — a rule fires when its key is in the patch,
  receives the patch value plus the pre-patch <code>state</code>, and returns keys to ADD to
  the patch. Attached with <code>.effect()</code>, everything is typed from the graph — no
  generics, no wrapper:
</p>

<pre>{`export const contact = defineGraph()
  .field('isBusiness', boolOf())
  .field('company', (ctx) => (ctx.isBusiness ? COMPANY : null))
  .effect({
    // switching OFF business clears the business-only intent
    isBusiness: (value) =>
      value === false ? { company: undefined, vatId: undefined } : undefined,
  });`}</pre>

<h2>Where rules RUN vs where they're ATTACHED</h2>
<p>
  Every rule executes at the form level, on every <code>set()</code> — attachment decides
  ownership and packaging, never timing. What attachment DOES buy you is scoping, supplied by
  structure:
</p>
<ul>
  <li>
    <strong>On a graph</strong>: the rules travel with it — into a parent via
    <code>.use()</code>, into a hub as a member, into a form via
    <code>reconcile: [...graph.effects]</code>.
  </li>
  <li>
    <strong>On a hub member</strong>: AUTO-SCOPED. A rule attached to the <code>v2.5</code>
    subgraph fires only while <code>v2.5</code> is the picked branch — the hub knows its own
    dispatch, so nobody hand-writes the guard. A unit shared through a common prefix merges
    once and fires when any of its members is active.
  </li>
  <li>
    <strong>On the hub itself</strong> (<code>branch(...).effect(...)</code>): NOT auto-scoped
    — the hub can't know when the mounting form considers it active. Guard it yourself with
    <code>scope</code> (below) if the form hosts more than this hub.
  </li>
</ul>

<h2><code>defineRules</code>: the escape hatch for config and guards</h2>
<p>
  Reach for it in exactly two situations: the rule set needs app CONFIG bound once
  (<code>defineRules&lt;Cfg, State&gt;(&#123;...&#125;)(cfg)</code>), or it needs a manual
  <code>scope</code> guard — a predicate over the pre-patch state, evaluated on every
  <code>set()</code>, that answers "does this unit apply right now". Scope is not
  change-detection: it doesn't care when the scoped value last changed, only what it is.
</p>

<pre>{`export const wanCoupling = defineRules<void, WanRuleState>({
  // hub-level rules for a hub that shares the form with another family
  scope: (state) => wanEcosystems.has(state.ecosystem ?? ''),
  rules: () => ({
    model: (model, { state }) => { ... },
  }),
});`}</pre>

<h2>Semantics worth knowing</h2>
<ul>
  <li>
    Rules see the RAW patch — reconcile runs before the input codecs, so a rule's value
    parameter is what the caller passed, not the snapped/validated value.
  </li>
  <li>
    One ordered pass per <code>set()</code>, each rule at most once, no rewind — keys a rule
    adds do NOT re-trigger other rules, so cycles are structurally unrepresentable. If B must
    react to what A adds, order A's unit first — or reconsider: a chain that deep usually
    belongs in the graph as computed conditions.
  </li>
  <li>
    Rule of thumb: an effect when a choice implies another choice; <code>correct</code> when
    the world changed under a choice; the output schema when the choice itself is
    unacceptable.
  </li>
</ul>
