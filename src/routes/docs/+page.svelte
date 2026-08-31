<script lang="ts">
  import { base } from '$app/paths';
</script>

<h1>Getting started</h1>

<p>
  Install the package and your framework binding's peer (the core has no framework dependency;
  <code>zod</code> is optional — any Standard Schema library works):
</p>

<pre>{`pnpm add form-graph zod`}</pre>

<h2>1. A field is one definition</h2>
<p>
  Everything about a field lives in one object: a lenient <code>input</code> schema for
  untrusted boundaries (storage, URLs, raw server input), a strict <code>output</code> schema
  for submit, a default, UI meta, and — when the field needs them — its memory scope and
  correction policy. The helpers build common definitions and cache their schemas
  automatically:
</p>

<pre>{`import { defineGraph } from 'form-graph';
import { slider, enumOf, textOf, boolOf } from 'form-graph/defs';
import { z } from 'zod';

const graph = defineGraph()
  .field('mode', enumOf({
    options: [
      { value: 'create', label: 'Create' },
      { value: 'upscale', label: 'Upscale' },
    ],
    default: 'create',
  }))
  .field('prompt', {
    input: z.string().optional(),
    output: z.string().min(1, 'Prompt is required'),   // full zod, yours
    default: '',
  })
  // CONDITIONAL fields are FUNCTIONS of one bag: the fields declared ABOVE
  // (destructure exactly what you read — a later field is a compile error)
  // plus the external context under _ext. Return null for "absent this pass".
  .field('steps', ({ mode }) => (mode === 'create' ? slider({ min: 1, max: 50, default: 25 }) : null))
  .field('scale', ({ mode }) => (mode === 'upscale' ? slider({ min: 2, max: 4, default: 2 }) : null))
  .computed('summary', ({ mode, prompt }) => \`\${mode} · \${prompt.length} chars\`);`}</pre>

<h2>2. Use it</h2>
<p>
  There is no mounting step — the graph IS the form. The runtime lives on the definition:
</p>

<pre>{`// Client: a live store — per-field subscriptions, persistent scoped memory.
const store = graph.createStore();

// Server: the same pipeline over raw input. One behavior, both sides.
const result = graph.parse(rawBody);`}</pre>

<p>
  External context (limits, permissions — facts the form reads but the user doesn't edit) is
  the graph's type parameter, and every definition function receives it:
</p>

<pre>{`const g = defineGraph<{ maxSteps: number }>()
  .field('steps', ({ _ext }) => slider({ min: 1, max: _ext.maxSteps, default: 25 }));

const store = g.createStore({ ext: { maxSteps: 50 } });
store.setExt({ maxSteps: 30 });   // the whole form re-resolves`}</pre>

<h2>3. Render it</h2>
<p>
  The graph's registry types every key exactly — conditional fields included — so the bindings
  need no annotations (see the <a href="{base}/docs/svelte">Svelte</a> and
  <a href="{base}/docs/react">React</a> pages):
</p>

<pre>{`<Field {store} name="steps">
  {#snippet children(snap, setValue)}
    <input type="range" min={snap.meta.min} max={snap.meta.max}
           value={snap.value} oninput={(e) => setValue(Number(e.currentTarget.value))} />
  {/snippet}
</Field>`}</pre>

<p>
  From here: <a href="{base}/docs/concepts">Core concepts</a> for the ideas underneath
  (intent, scoped memory, corrections), <a href="{base}/docs/definitions">Definitions</a> for the
  full anatomy, and the <a href="{base}/demo">demos</a> — every one shows its own source.
</p>
