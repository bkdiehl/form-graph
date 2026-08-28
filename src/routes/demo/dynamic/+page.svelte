<script lang="ts">
  import { formState } from '$lib/svelte/index.js';
  import AutoField from './AutoField.svelte';
  import SourceCode from '../SourceCode.svelte';
  import formSource from '../vm/vm-form.ts?shiki';
  import autoFieldSource from './AutoField.svelte?shiki';
  import { vmForm, defaultVmExt } from '../vm/vm-form.js';

  const store = vmForm.createStore({ ext: defaultVmExt });

  // This site is statically hosted, so the "server side" runs here — but it
  // is LITERALLY the same call a server would make: vmForm.parse(raw, ext)
  // over the serialized state, no store involved.
  let parsed = $state<string | null>(null);
  function parseLikeAServer() {
    const raw = JSON.parse(JSON.stringify(snapshot.current)) as Record<string, unknown>;
    const result = vmForm.parse(raw, defaultVmExt);
    parsed = JSON.stringify(
      result.success
        ? { data: result.data, computedKeys: result.computedKeys, notes: result.notes ?? [] }
        : { errors: result.errors },
      null,
      2
    );
  }
  const snapshot = formState(store);
  // Reading snapshot.current makes the key list track branch switches.
  const keys = $derived((snapshot.current, store.getSnapshot().keys));
</script>

<main>
  <h1 class="font-display text-3xl font-bold tracking-tight">Schema-driven rendering</h1>
  <p class="mt-4 max-w-[65ch] leading-relaxed text-muted">
    The other consumption style: no hand-written controls at all. The page iterates the
    snapshot's <code>keys</code> and renders each field generically from its value shape and
    meta — the VM configurator's form, driven entirely by the schema. The parse button below
    serializes the visible state and runs it through <code>vmForm.parse()</code> — the exact
    call a server handler makes with the same definition.
  </p>

  <section class="my-6 flex flex-col">
    {#each keys as key (key)}
      <AutoField {store} name={key} />
    {/each}
  </section>

  <button
    type="button"
    class="cursor-pointer rounded border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
    onclick={parseLikeAServer}
  >
    Parse (the server-side call)
  </button>

  {#if parsed}
    <section class="mt-6">
      <h2 class="font-display text-lg font-semibold">vmForm.parse() result</h2>
      <pre class="mt-3">{parsed}</pre>
    </section>
  {/if}
  <SourceCode code={autoFieldSource} filename="AutoField.svelte" />
  <SourceCode code={formSource} filename="vm-form.ts" />
</main>
