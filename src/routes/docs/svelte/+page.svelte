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

<h2>Typed fields</h2>
<p>
  <code>createTypedField</code> derives a <code>field()</code> from your codec registry, so
  <code>name</code> narrows <code>value</code> and <code>meta</code> with no per-call-site
  generics — the Svelte counterpart of React's <code>createTypedController</code>:
</p>

<pre>{`const codecs = { steps: STEPS, aspectRatio: ASPECT };
const typedField = createTypedField<typeof codecs>();

const steps = typedField(store, 'steps');
// steps.current: FieldSnapshot<number, SliderMeta> | null`}</pre>

<p>The <a href="/demo">typed demo</a> is built entirely this way.</p>

<h2>Testing gotcha</h2>
<p>
  Svelte 5 ships separate client and server runtimes. Under vitest, add
  <code>resolve.conditions: ['browser']</code> — without it the <em>server</em> runtime loads,
  where effects are inert, and every reactivity assertion silently sees zero runs.
</p>
