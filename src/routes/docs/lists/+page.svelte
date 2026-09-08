<script lang="ts">
  import { base } from '$app/paths';
</script>

<h1>Collections</h1>

<p>
  <code>list()</code> is the second combinator (the first is <code>branch</code>): N independent
  sub-records of one shape — invoice lines, training runs, screening questions — each resolved
  through its own member graph, with its own branches, its own computeds, its own errors, its
  own persistence.
</p>

<pre>{`const runGraph = defineGraph()
  .field('engine', ENGINE)
  .use(branch('engine', [...arms] as const))
  .computed('lineTotal', ({ hours, rate }) => hours * rate);

const form = defineGraph()
  .field('client', CLIENT)
  .use(list('runs', runGraph, { min: 1, max: 5 }))
  // the assembled elements are ordinary upstream state — aggregate freely
  .computed('total', ({ runs }) => runs.reduce((sum, r) => sum + r.lineTotal, 0));`}</pre>

<p>
  Any graph can hold a list — root or member, so lists nest. The member graph is an ordinary
  <code>defineGraph</code>; nothing in it knows it will be repeated.
</p>

<h2>Element paths</h2>
<p>
  Each element's fields live at dotted paths — <code>runs[a1b2].engine</code> — flat in the
  resolution, which is the whole trick: subscriptions, per-field diffing, scoped
  <code>validate</code>, <code>setError</code> and storage are all path-aware with no new
  machinery. <code>set</code> writes one element without touching siblings:
</p>

<pre>{`store.set({ 'runs[a1b2].engine': 'musubi' });
store.getField('runs[a1b2].lineTotal');     // that element's computed
store.setError('runs[a1b2].sku', { message: 'Unknown SKU' });`}</pre>

<p>
  Ids are identities, not indices — reordering never rewrites an element's address, and
  persistence follows the id. A fresh list seeds <code>min</code> elements with DETERMINISTIC
  ids (<code>s0</code>…), so an untouched membership never needs persisting and a stored
  element's edits bind across sessions; ids minted by <code>add()</code> are random and land in
  durable intent with the op that created them.
</p>

<h2>The ops</h2>
<pre>{`const runs = store.list('runs');
runs.add(seed?)      // -> { success: true, id }
runs.remove(id)      // sweeps the element's intent subtree and external errors
runs.duplicate(id)   // copies USER-WRITTEN entries; adopted defaults re-derive
runs.move(id, index)`}</pre>
<p>
  Bounds refuse — <code>&#123; success: false, reason: 'min' | 'max' | 'unknown_id' &#125;</code>
  — so the store never holds an invalid membership. A boundary value outside the bounds
  (tampered storage, raw server input) is corrected with a <code>list_bounds</code> note, never
  obeyed. Every op is an ordinary write: rules can react, storage saves with it.
</p>

<h2>Validation and data</h2>
<p>
  An element's error keys by its full path (<code>runs[a1b2].epochs</code>) and blames no
  sibling. <code>validate('runs')</code> judges the whole list — every element, nested lists
  included — which is what makes a list a wizard step's gate. Parsed data carries the assembled
  member DATA in membership order, member wire dispositions applied per element; the ids never
  reach the wire:
</p>

<pre>{`result.data.runs
// [ { engine: 'kohya', epochs: 5, lineTotal: 960 },
//   { engine: 'musubi', epochs: 9, lineTotal: 25 } ]`}</pre>

<h2>Rendering: the isolation contract</h2>
<p>
  The bindings subscribe to the MEMBERSHIP entry for the shell and per-element for rows — see
  the <a href="{base}/docs/react">React</a> (<code>useList</code> / <code>&lt;ListElement&gt;</code>)
  and <a href="{base}/docs/svelte">Svelte</a> (<code>list</code> / <code>elementPath</code>) pages.
  The contract, pinned by render-count tests on both frameworks:
</p>
<ul>
  <li>editing element X's field wakes X's subscribers only — no sibling, no shell;</li>
  <li>add / remove / duplicate wake the shell only — no surviving element;</li>
  <li>reorder wakes the shell only.</li>
</ul>
<p>
  Worked examples: the <a href="{base}/demo/invoice">invoice builder</a> (ops, per-row branches,
  cross-element totals, external errors) and the <a href="{base}/demo/wizard">wizard</a> (a list as a
  step gate).
</p>

<h2>Current limits</h2>
<ul>
  <li>
    Member-graph <code>effect</code> rules are not merged yet (rule patch keys wouldn't match
    element paths) — cross-field reactions inside an element belong in computeds and
    <code>correct</code> for now.
  </li>
  <li>
    The flat registry deliberately excludes member defs (two lists could collide), so
    <code>typedFields</code> / <code>useTypedField</code> cover root fields; element access
    types by path SHAPE (<code>`$&#123;string&#125;[$&#123;string&#125;].$&#123;string&#125;`</code>).
  </li>
  <li>
    Server <code>parse</code> takes intent-shaped records — <code>parse(store.getIntent())</code>
    round-trips lists losslessly (membership entry + path-keyed values; see Server parsing).
    Array-of-objects ingestion (<code>parse(&#123; runs: [&#123;…&#125;] &#125;)</code>) from a
    non-form-graph caller is a planned follow-up.
  </li>
</ul>
