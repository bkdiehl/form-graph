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

<h2>Typed fields — from the form, not a registry export</h2>
<p>
  Declare the codecs once, on the form. The store carries the registry's type, and
  <code>typedFields(store)</code> reads it back — the page imports nothing but the form:
</p>

<pre>{`// my-form.ts
export const form = defineForm()({
  codecs: { steps: STEPS, aspectRatio: ASPECT },
  resolve,
});

// +page.svelte
const store = form.createStore({ ext });
const f = typedFields(store);

f.steps.current
// FieldSnapshot<number, SliderMeta> | null — inferred, no annotation`}</pre>

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

<p>The <a href="/demo">demos</a> are built entirely this way.</p>

<h2>Testing gotcha</h2>
<p>
  Svelte 5 ships separate client and server runtimes. Under vitest, add
  <code>resolve.conditions: ['browser']</code> — without it the <em>server</em> runtime loads,
  where effects are inert, and every reactivity assertion silently sees zero runs.
</p>
