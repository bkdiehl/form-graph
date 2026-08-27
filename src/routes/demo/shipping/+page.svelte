<script lang="ts">
  import { browser } from '$app/environment';
  import { debouncedStorage, type StorageAdapter } from '$lib/index.js';
  import { formState, typedFields } from '$lib/svelte/index.js';
  import Slider from '../Slider.svelte';
  import { shippingForm } from './shipping-form.js';

  // sessionStorage this time: a quote is tab-scoped work-in-progress, not a
  // durable preference — close the tab and it's gone, reload and it's back.
  // Same adapter contract as localStorage; only the backend differs.
  const KEY = 'form-graph-demo:shipping';
  const backend: StorageAdapter = {
    load: () => {
      try {
        return JSON.parse(sessionStorage.getItem(KEY) ?? 'null') ?? undefined;
      } catch {
        return undefined;
      }
    },
    save: (intent) => sessionStorage.setItem(KEY, JSON.stringify(intent)),
  };
  const storage = browser ? debouncedStorage(backend, 300) : undefined;

  const store = shippingForm.createStore({ ext: undefined, storage });

  $effect(() => {
    if (!storage) return;
    const flush = () => storage.flush();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  });

  // Typed handles derived from the form itself — no registry import.
  const f = typedFields(store);

  const snapshot = formState(store);
  const s = $derived(snapshot.current);
  const notes = $derived((snapshot.current, store.getNotes()));

  let submitted = $state<string | null>(null);
  function requestQuote() {
    const result = store.validate();
    submitted = JSON.stringify(result.success ? result.data : { errors: result.errors }, null, 2);
  }
</script>

{#snippet enumButtons(name: string, current: unknown, options: { value: string; label: string }[])}
  <div class="flex items-center gap-3 py-1.5">
    <span class="w-32 shrink-0 font-mono text-sm text-muted">{name}</span>
    <span class="flex flex-wrap gap-1.5">
      {#each options as option (option.value)}
        <button
          type="button"
          class="cursor-pointer rounded border px-3 py-1 text-sm transition-colors {current ===
          option.value
            ? 'border-accent bg-accent font-medium text-ground'
            : 'border-line bg-surface text-muted hover:text-ink'}"
          onclick={() => store.set({ [name]: option.value })}
        >
          {option.label}
        </button>
      {/each}
    </span>
  </div>
{/snippet}

<main>
  <h1 class="font-display text-3xl font-bold tracking-tight">Shipping quote</h1>
  <p class="mt-4 max-w-[65ch] leading-relaxed text-muted">
    Rung two: a real-world shape. Watch the computed <em>chain</em> — dimensions →
    dimensional weight → billable weight → price — and the two different reactions to a bad
    combination: switching a freight-ocean quote to parcel silently
    <em class="text-ink">projects</em> the service (with a note), while explosives on an air
    service <em class="text-ink">refuses</em> at submit. Persisted to
    <strong class="text-ink">sessionStorage</strong>: reload keeps the quote, closing the tab
    discards it.
  </p>

  <section class="my-6 flex flex-col">
    {#if f.shipmentType.current?.meta}
      {@render enumButtons('shipmentType', f.shipmentType.current.value, f.shipmentType.current.meta.options)}
    {/if}
    {#if f.service.current?.meta}
      {@render enumButtons(
        'service',
        f.service.current.value,
        f.service.current.meta.options.map((value) => ({ value, label: value }))
      )}
    {/if}
    {#if f.destination.current?.meta}
      {@render enumButtons('destination', f.destination.current.value, f.destination.current.meta.options)}
    {/if}

    {#if f.hazmatClass.current?.meta}
      {@render enumButtons('hazmatClass', f.hazmatClass.current.value, f.hazmatClass.current.meta.options)}
      {#if f.hazmatClass.current.error}
        <p class="ml-35 text-xs text-problem">{f.hazmatClass.current.error.message}</p>
      {/if}
    {/if}

    {#if f.residential.current}
      <label class="flex items-center gap-3 py-1.5">
        <span class="w-32 font-mono text-sm text-muted">residential</span>
        <input
          type="checkbox"
          class="accent-accent"
          checked={f.residential.current.value}
          onchange={(e) => store.set({ residential: e.currentTarget.checked })}
        />
        <span class="text-xs text-faint">liftgate surcharge — freight ground only</span>
      </label>
    {/if}

    <Slider label="lengthCm" field={f.lengthCm} onchange={(v) => store.set({ lengthCm: v })} />
    <Slider label="widthCm" field={f.widthCm} onchange={(v) => store.set({ widthCm: v })} />
    <Slider label="heightCm" field={f.heightCm} onchange={(v) => store.set({ heightCm: v })} />
    <Slider label="actualKg" field={f.actualKg} onchange={(v) => store.set({ actualKg: v })} />

    {#if f.contents.current}
      <label class="flex items-center gap-3 py-1.5">
        <span class="w-32 font-mono text-sm text-muted">contents</span>
        <input
          type="text"
          class="max-w-64 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm"
          placeholder="What's in the box?"
          value={f.contents.current.value}
          oninput={(e) => store.set({ contents: e.currentTarget.value })}
        />
        {#if f.contents.current.error}
          <span class="text-xs text-problem">{f.contents.current.error.message}</span>
        {/if}
      </label>
      <Slider
        label="declaredValue"
        field={f.declaredValue}
        onchange={(v) => store.set({ declaredValue: v })}
      />
      {#if f.incoterms.current?.meta}
        {@render enumButtons('incoterms', f.incoterms.current.value, f.incoterms.current.meta.options)}
      {/if}
    {/if}
  </section>

  <section class="my-6 rounded-lg border border-line bg-surface p-4">
    <p class="font-mono text-xs tracking-widest text-faint uppercase">The computed chain</p>
    <dl class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <div class="rounded border border-line px-3 py-1.5">
        <dt class="text-xs text-faint">dim weight</dt>
        <dd class="tabular-nums">{s.dimKg} kg</dd>
      </div>
      <span class="text-faint">→</span>
      <div class="rounded border border-line px-3 py-1.5">
        <dt class="text-xs text-faint">billable = max(actual, dim)</dt>
        <dd class="tabular-nums">{s.billableKg} kg</dd>
      </div>
      <span class="text-faint">→</span>
      <div class="rounded border border-mechanism px-3 py-1.5">
        <dt class="text-xs text-faint">price (+{s.surcharges} surcharges)</dt>
        <dd class="font-medium tabular-nums">${s.price.toFixed(2)}</dd>
      </div>
      <div class="ml-4 rounded border border-line px-3 py-1.5">
        <dt class="text-xs text-faint">transit</dt>
        <dd class="tabular-nums">{s.transitDays} days</dd>
      </div>
    </dl>
  </section>

  {#if notes.length > 0}
    <section class="my-6 rounded-lg border border-problem/40 bg-surface p-4">
      <p class="font-mono text-xs tracking-widest text-problem uppercase">Projection notes</p>
      <ul class="mt-2 flex flex-col gap-1 text-sm text-muted">
        {#each notes as note, i (i)}
          <li>
            <code>{note.key}</code> → <code>{note.kind}</code>
            {#if note.detail}
              <span class="text-faint">{JSON.stringify(note.detail)}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <button
    type="button"
    class="cursor-pointer rounded border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
    onclick={requestQuote}
  >
    Request quote (strict validate)
  </button>
  <span class="ml-3 text-xs text-faint">
    Try: freight + ocean, then switch to parcel. Or hazmat + air + Class 1.4, then submit.
  </span>
  {#if submitted}
    <pre class="mt-4">{submitted}</pre>
  {/if}
</main>
