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
  <h1>Live demo: the generation form</h1>
  <p>
    One definition, both sides: the fields below run the store client-side; submitting posts the
    visible state to a form action that parses it with the <em>same</em> definition on the server.
  </p>

  <section class="fields">
    {#each keys as key (key)}
      <AutoField {store} name={key} />
    {/each}
  </section>

  <form method="POST" use:enhance>
    <input type="hidden" name="state" value={JSON.stringify(state.current)} />
    <button type="submit">Parse on the server</button>
  </form>

  {#if form}
    <section class="result">
      <h2>{'data' in form ? 'Server parse: success' : 'Server parse: failed'}</h2>
      <pre>{JSON.stringify(form, null, 2)}</pre>
    </section>
  {/if}
</main>

<style>
  .fields {
    margin: 1.5rem 0;
    display: flex;
    flex-direction: column;
  }
  .result pre {
    background: #f5f5f5;
    padding: 1rem;
    overflow-x: auto;
    font-size: 0.8rem;
  }
</style>
