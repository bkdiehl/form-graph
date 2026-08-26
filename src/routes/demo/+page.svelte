<script lang="ts">
  import { createTypedField, formState } from '$lib/svelte/index.js';
  import { demoCodecs, demoForm } from './demo-form.js';
  import Slider from './Slider.svelte';

  const store = demoForm.createStore({ ext: undefined });

  // One create-site annotation; every key below gets its codec's value/meta
  // types with no per-call generics.
  const typedField = createTypedField<typeof demoCodecs>();
  const mode = typedField(store, 'mode'); // 'create' | 'upscale', EnumMeta
  const prompt = typedField(store, 'prompt'); // string
  const steps = typedField(store, 'steps'); // number, SliderMeta
  const cfgScale = typedField(store, 'cfgScale');
  const scale = typedField(store, 'scale');
  const aspectRatio = typedField(store, 'aspectRatio');

  const snapshot = formState(store);
  const s = $derived(snapshot.current);

  let submitted = $state<string | null>(null);
  function validate() {
    const result = store.validate();
    submitted = JSON.stringify(result.success ? result.data : { errors: result.errors }, null, 2);
  }
</script>

<main>
  <h1>Typed controls</h1>
  <p>
    The recommended consumption path: <code>createTypedField</code> is annotated once with the
    app's codec registry, and every control below receives its key's exact <code>value</code> and
    <code>meta</code> types — the <code>Slider</code> component only compiles against
    number/SliderMeta fields. The state panel narrows the discriminated union with a plain
    <code>if</code>. Source: <code>src/routes/demo</code>.
  </p>

  <section class="fields">
    {#if mode.current?.meta}
      <label class="row">
        <span class="name">mode</span>
        <select
          value={mode.current.value}
          onchange={(e) => store.set({ mode: e.currentTarget.value })}
        >
          {#each mode.current.meta.options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if prompt.current}
      <label class="row">
        <span class="name">prompt</span>
        <input
          type="text"
          value={prompt.current.value}
          oninput={(e) => store.set({ prompt: e.currentTarget.value })}
        />
        {#if prompt.current.error}
          <span class="error">{prompt.current.error.message}</span>
        {/if}
      </label>
    {/if}

    <Slider label="steps" field={steps} onchange={(value) => store.set({ steps: value })} />
    <Slider label="cfgScale" field={cfgScale} onchange={(value) => store.set({ cfgScale: value })} />
    <Slider label="scale" field={scale} onchange={(value) => store.set({ scale: value })} />

    {#if aspectRatio.current?.meta}
      <label class="row">
        <span class="name">aspectRatio</span>
        <span class="options">
          {#each aspectRatio.current.meta.options as option (option.value)}
            <button
              type="button"
              class:selected={aspectRatio.current.value === option.value}
              onclick={() => store.set({ aspectRatio: option.value })}
            >
              {option.label}
            </button>
          {/each}
        </span>
      </label>
    {/if}
  </section>

  <section class="panel">
    <h2>Narrowing the union</h2>
    <p>
      <code>state.current</code> is the discriminated union straight from the resolver — the
      branch decides which keys exist, and TypeScript knows it:
    </p>
    {#if s.mode === 'upscale'}
      <p class="narrowed">
        <code>mode === 'upscale'</code> → <code>s.scale</code> is a <code>number</code>:
        upscaling <strong>{s.scale}×</strong>. (<code>s.steps</code> doesn't exist here — using it
        wouldn't compile.)
      </p>
    {:else}
      <p class="narrowed">
        <code>mode === 'create'</code> → <code>{s.steps}</code> steps at cfg
        <code>{s.cfgScale}</code>, <code>{s.aspectRatio}</code>. (<code>s.scale</code> doesn't
        exist here.)
      </p>
    {/if}
    <p>
      Switch modes, change values, switch back — scoped intent means each branch remembers its own
      values.
    </p>
  </section>

  <button type="button" class="validate" onclick={validate}>Validate (strict output)</button>
  {#if submitted}
    <pre>{submitted}</pre>
  {/if}
</main>

<style>
  .fields {
    margin: 1.5rem 0;
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.3rem 0;
  }
  .name {
    width: 7rem;
    font-family: ui-monospace, monospace;
    font-size: 0.85rem;
  }
  .options {
    display: flex;
    gap: 0.4rem;
  }
  .options button {
    padding: 0.25rem 0.7rem;
    border: 1px solid #ccc;
    background: #fff;
    border-radius: 4px;
    cursor: pointer;
  }
  .options button.selected {
    background: #1a1a1a;
    color: #fff;
    border-color: #1a1a1a;
  }
  .panel {
    border: 1px solid #eee;
    border-radius: 6px;
    padding: 0.25rem 1rem 0.5rem;
    margin: 1.5rem 0;
  }
  .narrowed {
    background: #f6faf6;
    border-left: 3px solid #3a7;
    padding: 0.5rem 0.75rem;
  }
  .validate {
    padding: 0.5rem 1rem;
    cursor: pointer;
  }
  .error {
    color: #c0392b;
    font-size: 0.8rem;
  }
</style>
