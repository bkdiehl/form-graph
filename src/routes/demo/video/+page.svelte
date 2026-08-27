<script lang="ts">
  import { browser } from '$app/environment';
  import { debouncedStorage, type StorageAdapter } from '$lib/index.js';
  import { formState } from '$lib/svelte/index.js';
  import { videoForm, type VideoExt } from '$lib/civitai/video-hub.js';
  import AutoField from '../dynamic/AutoField.svelte';

  // The REAL civitai video generation form: full-fidelity ports of the two
  // most complex v1 data-graphs (ltx-graph.ts, wan-graph.ts), verified against
  // the vendored v1 code by 19 differential parity cases plus table pins and
  // compile-time type parity (src/lib/civitai/__tests__).
  const ext: VideoExt = {
    limits: { maxQuantity: 4, maxResources: 9, vidQuantity: 4 },
    user: { isMember: true, tier: 'gold' },
    gateRules: [],
  };

  const KEY = 'form-graph-demo:video';
  const backend: StorageAdapter = {
    load: () => {
      try {
        return JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? undefined;
      } catch {
        return undefined;
      }
    },
    save: (intent) => localStorage.setItem(KEY, JSON.stringify(intent)),
  };
  const storage = browser ? debouncedStorage(backend, 300) : undefined;

  const store = videoForm.createStore({ ext, storage });

  $effect(() => {
    if (!storage) return;
    const flush = () => storage.flush();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  });

  const snapshot = formState(store);
  const s = $derived(snapshot.current);
  const keys = $derived((snapshot.current, store.getSnapshot().keys));
  const notes = $derived((snapshot.current, store.getNotes()));

  const ECOSYSTEMS = [
    'LTXV2',
    'LTXV23',
    'LTXV25',
    'WanVideo14B_T2V',
    'WanVideo-22-T2V-A14B',
    'WanVideo-22-TI2V-5B',
    'WanVideo-25-T2V',
    'WanVideo27',
  ];
  const WORKFLOWS = ['txt2vid', 'img2vid', 'img2vid:first-last', 'img2vid:ref2vid', 'vid2vid:edit'];

  let submitted = $state<string | null>(null);
  function validate() {
    const result = store.validate();
    submitted = JSON.stringify(result.success ? result.data : { errors: result.errors }, null, 2);
  }
</script>

<main>
  <h1 class="font-display text-3xl font-bold tracking-tight">The real thing: LTX + Wan</h1>
  <p class="mt-4 max-w-[68ch] leading-relaxed text-muted">
    civitai's two most complex generation data-graphs — <code>ltx-graph.ts</code> (3 version
    subgraphs, distilled-model field visibility, resolution-driven tables) and
    <code>wan-graph.ts</code> (5 version subgraphs, workflow-driven ecosystem sync) — reproduced
    at full fidelity on form-graph, using the real config tables. The verbatim v1 code is
    vendored into this repo, and 19 differential parity cases assert value-and-key agreement
    branch by branch, alongside pinned tables and compile-time type parity.
  </p>

  <section class="my-6 flex flex-col gap-1">
    <div class="flex items-start gap-3 py-1">
      <span class="w-40 shrink-0 pt-1 font-mono text-sm text-muted">ecosystem</span>
      <div class="flex flex-wrap gap-1.5">
        {#each ECOSYSTEMS as eco (eco)}
          <button
            type="button"
            class="cursor-pointer rounded border px-2.5 py-1 text-xs transition-colors {'ecosystem' in
              s && s.ecosystem === eco
              ? 'border-accent bg-accent font-medium text-ground'
              : 'border-line bg-surface text-muted hover:text-ink'}"
            onclick={() => store.set({ ecosystem: eco })}
          >
            {eco}
          </button>
        {/each}
      </div>
    </div>
    <div class="flex items-start gap-3 py-1">
      <span class="w-40 shrink-0 pt-1 font-mono text-sm text-muted">workflow</span>
      <div class="flex flex-wrap gap-1.5">
        {#each WORKFLOWS as wf (wf)}
          <button
            type="button"
            class="cursor-pointer rounded border px-2.5 py-1 text-xs transition-colors {s.workflow ===
            wf
              ? 'border-accent bg-accent font-medium text-ground'
              : 'border-line bg-surface text-muted hover:text-ink'}"
            onclick={() => store.set({ workflow: wf })}
          >
            {wf}
          </button>
        {/each}
      </div>
    </div>
  </section>

  <section class="my-6 flex flex-col">
    {#each keys.filter((k) => k !== 'workflow' && k !== 'ecosystem') as key (key)}
      <AutoField {store} name={key} />
    {/each}
  </section>

  {#if notes.length > 0}
    <section class="my-6 rounded-lg border border-problem/40 bg-surface p-4">
      <p class="font-mono text-xs tracking-widest text-problem uppercase">Corrections</p>
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
    onclick={validate}
  >
    Validate (strict output)
  </button>
  <span class="ml-3 text-xs text-faint">
    Try: pick the LTXV23 Distilled checkpoint (cfg/steps vanish), switch resolution to 1080p
    (aspect tables + duration max change), switch to Wan 2.2 (whole branch swaps).
  </span>
  {#if submitted}
    <pre class="mt-4">{submitted}</pre>
  {/if}
</main>
