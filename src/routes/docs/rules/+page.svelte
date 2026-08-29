<h1>Effects (rules)</h1>

<p>
  Everything else in the library runs during resolve. Effects run on <code>set()</code>: they
  rewrite the PATCH before it reaches intent — the home for couplings between two USER choices,
  where picking one implies the other. The rewritten patch is remembered as if the user chose
  it; that's the defining difference from a definition's <code>correct</code>, which never
  touches intent.
</p>

<pre>{`import { defineRules } from 'form-graph';

export const coupling = defineRules<void, { ecosystem?: string; workflow?: string }>({
  // guard: fire only while the form is in this region — every unit shares
  // one reconcile pass, so scope keeps units out of each other's territory
  scope: (state) => state.ecosystem === 'Flux1',
  rules: () => ({
    // keyed by the TRIGGER field: runs when 'model' is in the patch
    model: (model, { patch, state }) => {
      if (model?.id === DRAFT_ID && state.workflow !== 'draft') {
        return { workflow: 'draft' };     // keys to ADD to the patch
      }
    },
  }),
});`}</pre>

<p>
  A void-config unit is usable directly — attach it to a graph
  (<code>.effect(coupling)</code>, surfaced as <code>graph.effects</code>) or list it in
  <code>defineForm(&#123; reconcile: [...] &#125;)</code>. Rules that need app config
  (catalogs, tables) declare a Config type and call the factory:
  <code>defineRules&lt;Cfg, State&gt;(&#123;...&#125;)(cfg)</code>.
</p>

<h2>Semantics worth knowing</h2>
<ul>
  <li>
    A rule receives the patch VALUE of its trigger key, plus the pre-patch <code>state</code>
    and the accumulated <code>patch</code>. It returns keys to merge in, or nothing.
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
