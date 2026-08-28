<h1>Core concepts</h1>

<h2>Intent, not form state</h2>
<p>
  The store's source of truth is <em>intent</em>: everything the user has ever chosen, keyed by
  address, never deleted when a branch deactivates. The visible state is always a pure function of
  intent plus external context. Switch away from a branch and back — your values return, because
  nothing was thrown away.
</p>

<h2>Scoped memory</h2>
<p>
  A field can declare a <code>scope</code>, and its intent is then remembered per scope value —
  <code>steps&#64;flux</code> and <code>steps&#64;sd</code> are separate memories. This is how "the
  model you picked for Flux" survives a trip through SDXL. Reads fall back to the bare key, so
  unscoped writes (raw server input, remixes) still land.
</p>

<pre>{`f.field('model', CHECKPOINT, { scope: ecosystemGroup });
f.field('images', IMAGES, { scope: workflow });`}</pre>

<h2>Dual schemas and trust</h2>
<p>
  Every value knows where it came from. UI writes are trusted and stored verbatim; boundary values
  (storage, URL, remix, raw server input) run the lenient <code>input</code> schema lazily, falling
  back to the default on failure — a corrupt stored value can never wedge the form. The strict
  <code>output</code> schema runs only on demand: submit, <code>output()</code>, server
  <code>parse()</code>. Nothing zod-shaped runs on the keystroke path.
</p>

<h2>Correction and refinement</h2>
<p>
  Two distinct reactions to an out-of-range value — logic is code, contracts are declarations:
</p>
<ul>
  <li>
    <code>f.correct(key, value, reason)</code> silently replaces during resolution — a
    <em>statement</em> in the resolver, right after the field it fixes: clamp a quantity to the
    user's limit, substitute a retired model. The reason rides to the server as an audit note and
    onto the field's snapshot for inline display. For mismatches the SYSTEM caused.
  </li>
  <li>
    <code>refine</code> narrows the codec's output schema under this pass's conditions, in zod's
    own vocabulary — <code>(s) =&gt; s.refine(...)</code> with <code>refineDeps</code> caching
    construction. A failing value keeps its place, carries a LIVE error, and fails submit. For
    mismatches the USER must resolve.
  </li>
</ul>

<h2>Rules</h2>
<p>
  Three words, one layer: you write <em>rules</em> (<code>defineRules</code>, a record keyed by
  the triggering field), a kit exposes them compiled as its <em>reconciler</em>, and the form's
  <em>reconcile</em> array composes those units in order. Cross-field couplings live in
  <code>defineRules</code>: a record keyed by the field whose change triggers it. Rules run in one ordered pass per <code>set()</code>, each rule at most once, no
  rewind — so cycles are structurally unrepresentable, not detected at runtime.
</p>

<pre>{`const coupling = defineRules<void, State>({
  scope: (state) => state.ecosystem === 'Flux1',
  rules: () => ({
    workflow: (workflow, { patch, state }) => {
      if (workflow === 'txt2img:draft' && state.model?.id !== DRAFT_ID) {
        return { model: { id: DRAFT_ID } };
      }
    },
  }),
});

defineForm<Ext>()({ resolve, reconcile: [coupling] });`}</pre>

<h2>When the system disagrees with the user</h2>
<p>
  Three mechanisms override or refuse a user's choice, and picking the wrong one is the most
  common way to misuse the library. The decision comes down to two questions: <em>whose fault is
  the mismatch</em>, and <em>which layer owns the fix</em>.
</p>
<table>
  <thead>
    <tr><th>Tool</th><th>Acts on</th><th>Use when</th><th>User sees</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><code>reconcile</code></td>
      <td>the patch, before intent</td>
      <td>
        two USER choices conflict and one must yield — picking model X implies workflow Y. The
        rewritten patch becomes intent: the coupling is remembered as if the user chose it.
      </td>
      <td>both fields update together</td>
    </tr>
    <tr>
      <td><code>f.correct</code></td>
      <td>resolved state; intent untouched</td>
      <td>
        the SYSTEM invalidated a stored choice — a retired option, a ceiling that moved, a branch
        that no longer offers the value. Intent survives, so restoring the old conditions restores
        the old choice.
      </td>
      <td>the field changes with an inline note and an audit entry</td>
    </tr>
    <tr>
      <td><code>refine</code></td>
      <td>the output contract</td>
      <td>
        only the USER can resolve it — a safety rule, a required decision. Silently rewriting
        would hide something they must confront.
      </td>
      <td>a live error; submit fails until they act</td>
    </tr>
  </tbody>
</table>
<p>
  For the most common case — a value that's sometimes unavailable — the <code>constrain</code>
  field option states the restriction once in the codec's own vocabulary, and the codec derives
  both the presentation and the correction from it, so the two halves can never disagree.
</p>
<p>
  Rule of thumb: <code>reconcile</code> when a choice implies another choice,
  <code>f.correct</code> when the world changed under a choice, <code>refine</code> when the
  choice itself is unacceptable. If you are reaching for <code>f.correct</code> on something the
  user just typed, you probably want <code>reconcile</code>; if you are reaching for it on a
  safety rule, you want <code>refine</code>.
</p>

<h2>Render isolation under full recompute</h2>
<p>
  Every <code>set()</code> recomputes the whole snapshot — and that's fine, because the diff is
  reference-preserving: a field whose data didn't move keeps its exact object identity, and its
  subscribers never fire. Full-recompute simplicity, fine-grained updates.
</p>

<h2>Field kits</h2>
<p>
  <code>defineFieldKit</code> packages a field's whole anatomy — codec, options, rules, scope — so
  an app defines "a checkpoint picker" once and instantiates it per branch. Kits are also the units
  the <code>reconcile</code> array composes.
</p>
