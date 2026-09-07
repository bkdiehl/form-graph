<script lang="ts">
  import { base } from '$app/paths';
</script>

<h1>Svelte binding</h1>

<p>
  <code>form-graph/svelte</code> bridges the store into Svelte 5 reactivity via
  <code>createSubscriber</code>. Each helper returns an object whose <code>current</code> getter is
  reactive: reading it inside an effect or template subscribes, and the subscription fires only when
  the underlying reference changes.
</p>

<pre>{`${'<'}script lang="ts">
  import { field, formState } from 'form-graph/svelte';
  import { form } from './my-form';

  const store = form.createStore({ ext });

  const prompt = field<string>(store, 'prompt');
  const steps = field<number, { min: number; max: number }>(store, 'steps');
${'<'}/script>

{#if prompt.current}
  <input
    value={prompt.current.value}
    oninput={(e) => store.set({ prompt: e.currentTarget.value })}
  />
  {#if prompt.current.error}
    <span>{prompt.current.error.message}</span>
  {/if}
{/if}

{#if steps.current}
  <input
    type="range"
    min={steps.current.meta.min}
    max={steps.current.meta.max}
    value={steps.current.value}
    oninput={(e) => store.set({ steps: Number(e.currentTarget.value) })}
  />
{/if}`}</pre>

<h2>Isolation</h2>
<p>
  <code>field()</code> subscribes per key, and the store's diff preserves references for
  structurally-unchanged fields — so typing in <code>prompt</code> wakes only <code>prompt</code>'s
  effects, even though every keystroke recomputes the full snapshot. <code>current</code> is
  <code>null</code> while the field is inactive in the current branch; when the branch returns, the
  remembered value comes back with it.
</p>

<pre>{`const state = formState(store); // whole-snapshot reactivity — prefer field() for controls`}</pre>

<h2>Typed fields — from the graph, not a registry export</h2>
<p>
  The graph's registry types every key — function-defined (conditional) fields included — and
  <code>typedFields(store)</code> reads it back; the page imports nothing but the form:
</p>

<pre>{`// my-form.ts
export const form = defineGraph()
  .field('aspectRatio', enumOf({ ... }))
  .field('steps', (c) => (c.mode === 'create' ? slider({ min: 1, max: 50 }) : null));

// +page.svelte
const store = form.createStore();
const f = typedFields(store);

f.steps.current
// FieldSnapshot<number, SliderDefMeta> | null — inferred, no annotation`}</pre>

<h2>&lt;Field&gt; — the form drives visibility</h2>
<p>
  Place <code>&lt;Field&gt;</code> flat on the page; it renders its snippet only while the
  current branch has the key, with the snapshot and a typed setter as snippet arguments. No
  <code>&#123;#if&#125;</code> re-stating branch logic the resolver already owns:
</p>

<pre>{`<Field {store} name="steps">
  {#snippet children(snap, setValue)}
    <input
      type="range"
      min={snap.meta.min}
      max={snap.meta.max}
      value={snap.value}
      oninput={(e) => setValue(Number(e.currentTarget.value))}
    />
  {/snippet}
</Field>`}</pre>

<p>The <a href="{base}/demo">demos</a> are built entirely this way.</p>

<h2>Lists: <code>list</code> and <code>elementPath</code></h2>
<pre>{`${'<'}script lang="ts">
  import { elementPath, field, list } from 'form-graph/svelte';

  const runs = list(store, 'runs');   // field()'s sibling: SUBSCRIBES (the -Of family builds defs)
${'<'}/script>

{#if runs.current}
  {#each runs.current.ids as id (id)}
    {@const p = elementPath('runs', id)}
    <RunRow {store} {id} />   <!-- or inline: field(store, p('engine')) -->
  {/each}
  <button onclick={() => runs.current.add()}>Add</button>
{/if}`}</pre>
<p>
  <code>list(store, key)</code> subscribes to the MEMBERSHIP entry only — add/remove/reorder
  wake it, an element edit never does — and exposes the ops
  (<code>add</code>/<code>remove</code>/<code>duplicate</code>/<code>move</code>, refusal-based;
  see Collections). <code>elementPath('runs', id)</code> returns a namer for that element's
  dotted paths: <code>p('engine')</code> → <code>runs[a1b2].engine</code>, which every helper on
  this page accepts (<code>field</code>, <code>store.set</code>, <code>setError</code>,
  <code>validate</code>). In a row component, derive the handles so a keyed row re-derives if
  its id ever changes: <code>const engine = $derived(field(store, p('engine')))</code>. The
  <a href="{base}/demo/invoice">invoice demo</a> is the worked example.
</p>

<h2><code>syncExt</code> — reactive ext, no hand-rolled guard</h2>
<pre>{`syncExt(store, () => ({ tier: data.tier, flags: data.flags }));`}</pre>
<p>
  Store creation needs no helper in Svelte (a component script runs once), but ext that follows
  reactive inputs does: <code>syncExt</code> pushes at setup — catching ext that hydrated
  BEFORE mount, the SvelteKit load/remount shape — and on every change of the getter's
  dependencies. <code>setExt</code> itself no-ops on a deep-equal ext, so the unconditional
  pushes are free and there is no shadow copy to drift.
</p>
<p>
  Argument order: the svelte helpers are all store-first (<code>list(store, key)</code> like
  <code>field(store, name)</code>) because the store is always required — Svelte has no
  ambient-store context for plain functions. React's <code>useList(key, store?)</code> is
  key-first only because its store can be omitted via <code>&lt;FormProvider&gt;</code>.
</p>

<h2>Focus on error</h2>
<p>
  <code>&lt;Field&gt;</code>'s snippet gains a third argument — spread it onto the focusable
  element, and core's <code>focusFirstError(store, keys?)</code> jumps to the first offender in
  declaration order (the <a href="{base}/demo/wizard">wizard demo</a>'s "Next" does exactly
  this). Hand-rendered inputs opt in with <code>data-fg-field=&#123;key&#125;</code> directly.
</p>
<pre>{`<Field {store} name="title">
  {#snippet children(snap, setValue, fieldProps)}
    <input {...fieldProps} value={snap.value} oninput={(e) => setValue(e.currentTarget.value)} />
  {/snippet}
</Field>`}</pre>

<h2>Testing gotcha</h2>
<p>
  Svelte 5 ships separate client and server runtimes. Under vitest, add
  <code>resolve.conditions: ['browser']</code> — without it the <em>server</em> runtime loads,
  where effects are inert, and every reactivity assertion silently sees zero runs.
</p>
