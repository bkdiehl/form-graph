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
  .field('company', (c) => (c.isBusiness ? COMPANY : null))
  .effect({
    // switching OFF business clears the business-only intent
    isBusiness: (value) =>
      value === false ? { company: undefined, vatId: undefined } : undefined,
  });`}</pre>

<h2>The general form: one callback for a decision that SPANS keys</h2>
<p>
  When several fields feed one reaction, a keyed map forces the logic into a helper shared by
  two entries. Pass a CALLBACK instead: it runs on every patch, checks <code>patch</code>
  itself, and reads the effective values from <code>next</code> — the whole decision inline:
</p>

<pre>{`.effect(({ patch, state, next }) => {
  if (!('workflow' in patch) && !('resolution' in patch)) return;
  const target = next.workflow === 'img2vid' ? 'i2v_' + next.resolution : 'none';
  if (state.ecosystem !== target) return { ecosystem: target };
});`}</pre>

<p>
  The map is sugar for the common case — one field triggers one reaction, with the trigger
  check and per-key typing supplied for you. The callback is the general case.
</p>

<h2>Where rules RUN vs where they're ATTACHED</h2>
<p>
  Every rule executes at the form level, on every <code>set()</code> — attachment decides
  ownership and packaging, never timing. What attachment DOES buy you is scoping, supplied by
  structure:
</p>
<ul>
  <li>
    <strong>On a graph</strong>: the rules travel with it — into a parent via
    <code>.use()</code>, into a hub as a member, and straight into the graph's own
    <code>createStore()</code>/<code>parse()</code>.
  </li>
  <li>
    <strong>On a branch member</strong>: AUTO-SCOPED, both forms. A rule attached to the
    <code>v2.5</code> subgraph fires only while <code>v2.5</code> is the picked branch — read
    from the discriminator in state (effectively: patch over state), so it stays correct
    under any mounting form and a member-switching patch fires the TARGET member's rules. A
    unit shared through a common prefix merges once.
  </li>
  <li>
    <strong>On the hub itself</strong> (<code>branch(...).effect(...)</code>): NOT auto-scoped
    — the hub can't know when the mounting form considers it active. Guard with an early
    return (below) if the form hosts more than this hub.
  </li>
</ul>

<h2>Config and guards, without machinery</h2>
<p>
  Rules that need app config (catalogs, id tables) are ordinary closures — a function returning
  the map. Rules that must guard against firing outside their territory — a hub-level coupling
  sharing the form with another family — guard with an early return, usually in the shared
  decision function:
</p>

<pre>{`// config: a closure
const draftCoupling = (draftId: number) => ({
  model: (model, { state }) => (model?.id === draftId ? { workflow: 'draft' } : undefined),
});
graph.effect(draftCoupling(fluxIds.draft));

// guard: an early return (this map rides a hub that shares the form)
wan.effect({
  workflow: (_v, { state, next }) => {
    if (!wanEcosystems.has(state.ecosystem ?? '')) return;
    ...
  },
});`}</pre>

<h2>Semantics worth knowing</h2>
<ul>
  <li>
    Rules see the RAW patch — reconcile runs before the input schemas, so a rule's value
    parameter is what the caller passed, not the snapped/validated value.
  </li>
  <li>
    <code>c.next</code> is the state with the accumulated patch overlaid — the effective
    values. A decision reading several fields reads <code>next</code>, because any of them may
    be in this very patch and <code>state</code> alone is a stale-read bug.
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

<h2>Sticky selections are BUILT IN: adopted defaults</h2>
<p>
  A field that falls through to its default has that value ADOPTED as session
  memory at its active address: the displayed default survives sibling changes
  exactly like a user choice, storage saves stay user-writes-only, and a fresh
  session re-derives today's defaults. Per-address adoption keeps per-bucket
  defaults (turbo vs base variants) independent — no per-field policy needed.
  Pass <code>sessionMemory</code> (a plain Map you keep at module scope) in
  <code>StoreOptions</code> if the store unmounts and remounts within a page
  (a tab switch) and the session's view should survive it.
</p>
<p>
  What rules remain FOR in this area: genuine cross-field coupling — a
  selection that must RETARGET another selection when the pair becomes invalid
  (redirects, substitutions). Stickiness itself no longer needs a rule.
</p>
