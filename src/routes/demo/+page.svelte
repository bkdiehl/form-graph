<script lang="ts">
  import { formState, typedFields } from '$lib/svelte/index.js';
  import { demoForm } from './demo-form.js';
  import Slider from './Slider.svelte';
  import SourceCode from './SourceCode.svelte';
  import formSource from './demo-form.ts?shiki';

  const store = demoForm.createStore();

  // Typed handles derived from the form itself — no registry import.
  const f = typedFields(store);

  const snapshot = formState(store);
  const s = $derived(snapshot.current);

  let submitted = $state<string | null>(null);
  function validate() {
    const result = store.validate();
    submitted = JSON.stringify(result.success ? result.data : { errors: result.errors }, null, 2);
  }
</script>

<main>
  <h1 class="font-display text-3xl font-bold tracking-tight">Typed controls</h1>
  <p class="mt-4 max-w-[65ch] leading-relaxed text-muted">
    The recommended consumption path: <code>typedFields(store)</code> derives every key's exact
    <code>value</code> and <code>meta</code> types from the graph itself — the page imports
    nothing but the form. The <code>Slider</code> component only compiles against
    number/SliderDefMeta fields, and the state panel narrows the discriminated union with a
    plain <code>if</code>. Source: <code>src/routes/demo</code>.
  </p>

  <section class="my-6 flex flex-col">
    {#if f.mode.current?.meta}
      <label class="flex items-center gap-3 py-1.5">
        <span class="w-28 font-mono text-sm text-muted">mode</span>
        <select
          class="rounded border border-line bg-surface px-2 py-1 text-sm"
          value={f.mode.current.value}
          onchange={(e) => store.set({ mode: e.currentTarget.value })}
        >
          {#each f.mode.current.meta.options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if f.prompt.current}
      <label class="flex items-center gap-3 py-1.5">
        <span class="w-28 font-mono text-sm text-muted">prompt</span>
        <input
          type="text"
          class="max-w-64 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm"
          value={f.prompt.current.value}
          oninput={(e) => store.set({ prompt: e.currentTarget.value })}
        />
        {#if f.prompt.current.error}
          <span class="text-xs text-problem">{f.prompt.current.error.message}</span>
        {/if}
      </label>
    {/if}

    <Slider label="steps" field={f.steps} onchange={(value) => store.set({ steps: value })} />
    <Slider label="cfgScale" field={f.cfgScale} onchange={(value) => store.set({ cfgScale: value })} />
    <Slider label="scale" field={f.scale} onchange={(value) => store.set({ scale: value })} />

    {#if f.aspectRatio.current?.meta}
      <div class="flex items-center gap-3 py-1.5">
        <span class="w-28 font-mono text-sm text-muted">aspectRatio</span>
        <span class="flex gap-1.5">
          {#each f.aspectRatio.current.meta.options as option (option.value)}
            <button
              type="button"
              class="cursor-pointer rounded border px-3 py-1 text-sm transition-colors {f.aspectRatio
                .current?.value === option.value
                ? 'border-accent bg-accent font-medium text-ground'
                : 'border-line bg-surface text-muted hover:text-ink'}"
              onclick={() => store.set({ aspectRatio: option.value })}
            >
              {option.label}
            </button>
          {/each}
        </span>
      </div>
    {/if}
  </section>

  <section class="my-6 rounded-lg border border-line px-4 pt-1 pb-2">
    <h2 class="font-display mt-3 text-lg font-semibold">Narrowing the union</h2>
    <p class="mt-2 max-w-[65ch] text-sm leading-relaxed text-muted">
      <code>snapshot.current</code> is the discriminated union straight from the resolver — the
      branch decides which keys exist, and TypeScript knows it:
    </p>
    {#if s.mode === 'upscale'}
      <p class="my-3 border-l-2 border-mechanism bg-surface py-2 pl-3 text-sm leading-relaxed">
        <code>mode === 'upscale'</code> → <code>s.scale</code> is a <code>number</code>:
        upscaling <strong>{s.scale}×</strong>. (<code>s.steps</code> doesn't exist here — using it
        wouldn't compile.)
      </p>
    {:else}
      <p class="my-3 border-l-2 border-mechanism bg-surface py-2 pl-3 text-sm leading-relaxed">
        <code>mode === 'create'</code> → <code>{s.steps}</code> steps at cfg
        <code>{s.cfgScale}</code>, <code>{s.aspectRatio}</code>. (<code>s.scale</code> doesn't
        exist here.)
      </p>
    {/if}
    <p class="text-sm leading-relaxed text-muted">
      Switch modes, change values, switch back — scoped intent means each branch remembers its own
      values.
    </p>
  </section>

  <button
    type="button"
    class="cursor-pointer rounded border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
    onclick={validate}
  >
    Validate (strict output)
  </button>
  {#if submitted}
    <pre class="mt-4">{submitted}</pre>
  {/if}
  <SourceCode code={formSource} filename="demo-form.ts" />
</main>
