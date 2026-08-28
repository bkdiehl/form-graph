<h1>Introspection</h1>

<p>
  One-shot questions about a form without creating a store: which fields exist under these
  choices, what would a field's options be, which branches carry a key. Every helper runs the
  REAL resolver over pinned values — everything unpinned falls to its default — so the answers
  are exact, not a structural guess at conditions a walker can't evaluate.
</p>

<pre>{`import {
  fieldKeys, hasField, fieldMeta, optionsFor,
  enumerateBranches, whereFieldExists, allPossibleKeys,
} from 'form-graph';

// "Pins" are the choices you fix; the resolver decides the rest.
fieldKeys(form, { mode: 'upscale' }, ext);
// -> ['mode', 'prompt', 'scale']

hasField(form, 'steps', { mode: 'upscale' }, ext);   // -> false

fieldMeta(form, 'model', { workflow: 'txt2img', ecosystem: 'A' }, ext);
// -> that field's resolved meta under those pins (catalog, defaults, locks)

optionsFor(form, 'mode', {}, ext);
// -> candidate values, read from the field's own meta.options`}</pre>

<h2>Walking the branch space</h2>
<p>
  <code>enumerateBranches</code> expands the form's discriminant fields (the
  <code>axes</code>, in order) over their own option lists and returns one entry per reachable
  combination. An axis that isn't active under the current pins is skipped, so branches where a
  later discriminant never appears terminate early instead of needing a special case.
</p>

<pre>{`enumerateBranches(form, ['workflow', 'ecosystem'], ext);
// -> [ { pins: { workflow: 'txt2img', ecosystem: 'A' }, keys: [...] }, ... ]

whereFieldExists(form, 'sourceImage', ['workflow', 'ecosystem'], ext);
// -> only the combinations whose branch carries the field —
//    "which workflows accept image input?" without a hard-coded list

allPossibleKeys(form, ['workflow', 'ecosystem'], ext);
// -> every field key reachable through those axes`}</pre>

<h2>What it's for</h2>
<ul>
  <li>
    <strong>Capability matrices</strong> — a picker that must know, before switching, whether
    the target branch supports the current inputs.
  </li>
  <li>
    <strong>Tests</strong> — assert branch membership and option lists across the whole space
    in a loop, instead of one hand-written case per combination.
  </li>
  <li>
    <strong>Static generation</strong> — enumerate every branch at build time and prerender a
    page or an index per combination.
  </li>
</ul>

<p>
  Scoping is ignored on purpose: introspection is one-shot resolution with no intent, so
  <code>scope</code> declarations don't change the answers.
</p>
