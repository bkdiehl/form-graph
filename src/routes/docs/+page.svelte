<script lang="ts">
  import { base } from '$app/paths';
</script>

<h1>Getting started</h1>

<p>
  Install the package and your framework binding's peer (the core has no framework dependency;
  <code>zod</code> is optional — any Standard Schema library works):
</p>

<pre>{`pnpm add form-graph zod`}</pre>

<h2>1. Define codecs</h2>
<p>
  A codec is one field's contract: a lenient <code>input</code> schema for untrusted boundaries
  (storage, URLs, raw server input), a strict <code>output</code> schema for submit, a default, and
  optional UI metadata.
</p>

<pre>{`import { z } from 'zod';
import { codec } from 'form-graph';

// Types are INFERRED from the schemas — no annotations needed:
// this codec's value type is number, its meta type { min: number; max: number }.
const STEPS = codec({
  input: z.coerce.number().optional(),
  output: z.number().int().min(1).max(50),
  default: 25,
  meta: { min: 1, max: 50 },
});`}</pre>

<p>Annotate the generics (<code>codec&lt;T, M&gt;</code>) only in three cases:</p>
<ul>
  <li>
    you want the value typed as a <em>named</em> interface (<code>ResourceData</code>) instead of
    the anonymous zod-inferred shape — better tooltips and error messages for big objects;
  </li>
  <li>
    the meta type has no carrier on the codec (the meta is supplied per-pass at the
    <code>f.field</code> call site), so <code>M</code> must be declared;
  </li>
  <li>
    you deliberately want a wider type than the schema infers (<code>string</code> instead of a
    literal union) — the factory then checks the schemas against your assertion.
  </li>
</ul>

<h2>2. Write the resolver</h2>
<p>
  The resolver is a pure function from declared fields (plus external context) to the form's state.
  Branching is a plain <code>switch</code> — each arm returns a different shape, and the inferred
  return type is your discriminated union. No type annotations, no schema unions.
</p>

<pre>{`import { defineForm, type Fields } from 'form-graph';

interface Ext {
  limits: { maxQuantity: number };
}

export const form = defineForm({
  // The registry, inline: what lets typedFields()/<Field>/typed controllers
  // derive every key's value and meta types from the form itself.
  codecs: { mode: MODE, prompt: PROMPT, steps: STEPS, scale: SCALE },
  // Annotating ext here is what types the form's external context.
  resolve: (f: Fields, ext: Ext) => {
    const mode = f.field('mode', MODE); // 'create' | 'upscale'
    const base = { mode, prompt: f.field('prompt', PROMPT) };

    switch (mode) {
      case 'upscale':
        return { ...base, mode, scale: f.field('scale', SCALE) };
      default:
        return {
          ...base,
          steps: f.field('steps', STEPS),
          quantity: f.field('quantity', quantityCodec(ext.limits.maxQuantity)),
        };
    }
  },
});`}</pre>

<h2>3. Drive a client</h2>

<pre>{`// persistedStorage: JSON localStorage backend, debounced writes,
// pagehide flush, SSR-safe. Pass { session: true } for sessionStorage.
const store = form.createStore({ ext, storage: persistedStorage('my-form') });

store.set({ prompt: 'a cat' });   // one resolve pass; only changed fields notify
store.getField('steps');           // { value, meta, error, isComputed } | null
store.subscribe('steps', cb);      // per-field subscription
store.output();                    // strict-validated data — THROWS if invalid
store.validate();                  // the checked sibling: { success, data | errors }`}</pre>

<p>
  Bindings for <a href="{base}/docs/svelte">Svelte</a> and <a href="{base}/docs/react">React</a> wrap those
  three calls into idiomatic reactivity — nothing else lives in them.
</p>

<h2>4. Parse on the server</h2>

<pre>{`const result = form.parse(rawBody, ext);
if (result.success) {
  // result.data: the SAME discriminated union, strict-validated
}`}</pre>

<p>
  See <a href="{base}/docs/server">Server parsing</a> for errors, substitution notes, and
  <code>computedKeys</code>.
</p>
