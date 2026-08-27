<script lang="ts">
  import { enhance } from '$app/forms';
  import { generationForm } from '$lib/generation/hub.js';
  import { defaultExt } from '$lib/generation/config.js';
  import { formState } from '$lib/svelte/index.js';
  import AutoField from './AutoField.svelte';
  import type { ActionData } from './$types.js';

  const { form }: { form: ActionData } = $props();

  const store = generationForm.createStore({ ext: defaultExt });
  const state = formState(store);
  // Reading state.current makes the key list track branch switches.
  const keys = $derived((state.current, store.getSnapshot().keys));
</script>

<main>
  <h1 class="font-display text-3xl font-bold tracking-tight">Live demo: the generation form</h1>
  <p class="mt-4 max-w-[65ch] leading-relaxed text-muted">
    One definition, both sides: the fields below run the store client-side; submitting posts the
    visible state to a form action that parses it with the <em>same</em> definition on the server.
  </p>

  <section class="my-6 flex flex-col">
    {#each keys as key (key)}
      <AutoField {store} name={key} />
    {/each}
  </section>

  <form method="POST" use:enhance>
    <input type="hidden" name="state" value={JSON.stringify(state.current)} />
    <button
      type="submit"
      class="cursor-pointer rounded border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
    >
      Parse on the server
    </button>
  </form>

  {#if form}
    <section class="mt-6">
      <h2 class="font-display text-lg font-semibold">
        {'data' in form ? 'Server parse: success' : 'Server parse: failed'}
      </h2>
      <pre class="mt-3">{JSON.stringify(form, null, 2)}</pre>
    </section>
  {/if}
</main>
