<script lang="ts">
  import { persistedStorage } from '$lib/index.js';
  import { formState, typedFields } from '$lib/svelte/index.js';
  import Slider from '../Slider.svelte';
  import { vmForm } from './vm-form.js';

  // localStorage again — a machine spec is a durable preference. The scoped
  // intent is visible IN the stored record: keys like `instanceType@gpu` and
  // `vcpus@compute`, one bucket per preset.
  const storage = persistedStorage('form-graph-demo:vm');

  const store = vmForm.createStore({ storage });


  // Typed handles derived from the form itself — no registry import.
  const f = typedFields(store);

  const snapshot = formState(store);
  const s = $derived(snapshot.current);
  const notes = $derived((snapshot.current, store.getNotes()));
  const storedIntent = $derived((snapshot.current, store.getIntent()));
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
  <h1 class="font-display text-3xl font-bold tracking-tight">VM configurator</h1>
  <p class="mt-4 max-w-[65ch] leading-relaxed text-muted">
    Rung three: the hardest mechanisms together. The instance type and sliders are remembered
    <em class="text-ink">per workload preset</em> — configure a GPU box, detour through Compute,
    come back, and your A100 is still there. Changing region projects an unavailable type;
    lowering vCPUs drags an already-chosen RAM value down through its computed ceiling; spot
    removes the SLA field entirely. The stored-intent panel at the bottom shows the scoped
    buckets in <strong class="text-ink">localStorage</strong>, live.
  </p>

  <section class="my-6 flex flex-col">
    {#if f.preset.current?.meta}
      {@render enumButtons('preset', f.preset.current.value, f.preset.current.meta.options)}
    {/if}
    {#if f.region.current?.meta}
      {@render enumButtons('region', f.region.current.value, f.region.current.meta.options)}
    {/if}
    {#if f.instanceType.current?.meta}
      {@render enumButtons('instanceType', f.instanceType.current.value, f.instanceType.current.meta.options)}
      {#if f.instanceType.current.note}
        <p class="ml-35 text-xs text-accent">
          adjusted from {String(f.instanceType.current.note.detail?.from)} —
          {f.instanceType.current.note.kind}
        </p>
      {/if}
    {/if}

    <Slider label="vcpus" field={f.vcpus} onchange={(v) => store.set({ vcpus: v })} />
    <div class="flex items-center gap-3">
      <div class="min-w-0 flex-1">
        <Slider label="ramGb" field={f.ramGb} onchange={(v) => store.set({ ramGb: v })} />
      </div>
      <span class="text-xs whitespace-nowrap text-faint">ceiling {s.maxRam} GB (4 × vCPU)</span>
    </div>
    {#if 'gpuCount' in s}
      <Slider label="gpuCount" field={f.gpuCount} onchange={(v) => store.set({ gpuCount: v })} />
    {/if}

    {#if f.os.current?.meta}
      {@render enumButtons('os', f.os.current.value, f.os.current.meta.options)}
    {/if}
    {#if f.windowsLicense.current?.meta}
      {@render enumButtons('windowsLicense', f.windowsLicense.current.value, f.windowsLicense.current.meta.options)}
    {/if}

    {#if f.spot.current}
      <label class="flex items-center gap-3 py-1.5">
        <span class="w-32 font-mono text-sm text-muted">spot</span>
        <input
          type="checkbox"
          class="accent-accent"
          checked={f.spot.current.value}
          onchange={(e) => store.set({ spot: e.currentTarget.checked })}
        />
        <span class="text-xs text-faint">interruptible — 65% off, and the SLA field disappears</span>
      </label>
    {/if}
    {#if f.sla.current?.meta}
      {@render enumButtons('sla', f.sla.current.value, f.sla.current.meta.options)}
    {/if}
  </section>

  <section class="my-6 rounded-lg border border-line bg-surface p-4">
    <dl class="flex flex-wrap gap-8 text-sm">
      <div>
        <dt class="text-xs text-faint">hourly</dt>
        <dd class="font-medium tabular-nums">${s.hourly.toFixed(3)}</dd>
      </div>
      <div>
        <dt class="text-xs text-faint">monthly (730h)</dt>
        <dd class="font-medium tabular-nums">${s.monthly.toFixed(2)}</dd>
      </div>
      <div>
        <dt class="text-xs text-faint">network</dt>
        <dd class="tabular-nums">{s.bandwidth}</dd>
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

  <section class="my-6 rounded-lg border border-line bg-surface p-4">
    <p class="font-mono text-xs tracking-widest text-mechanism uppercase">
      Stored intent — the scoped buckets, live
    </p>
    <pre class="mt-3 border-0 bg-transparent p-0">{JSON.stringify(storedIntent, null, 2)}</pre>
  </section>

  <span class="text-xs text-faint">
    Try: pick gpu.a100, switch preset to Compute and back. Move region to ap-south with c2.metal
    selected. Drop vCPUs to 2 with RAM maxed. Then reload the page.
  </span>
</main>
