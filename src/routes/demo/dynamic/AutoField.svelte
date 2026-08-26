<script lang="ts">
  import { field } from '$lib/svelte/index.js';
  import type { FormStore } from '$lib/core/index.js';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { store, name }: { store: FormStore<any, any>; name: string } = $props();

  // Initial-value capture is intentional: the parent keys its {#each} by name,
  // so a changed name remounts this component rather than mutating the props.
  // svelte-ignore state_referenced_locally
  const f = field(store, name);

  type Option = { value: unknown; label?: string };
  const options = $derived.by(() => {
    const meta = f.current?.meta as { options?: unknown } | undefined;
    const raw = meta?.options;
    if (!Array.isArray(raw)) return null;
    return raw.map((o): Option => (typeof o === 'object' && o !== null ? (o as Option) : { value: o }));
  });

  function setValue(value: unknown) {
    store.set({ [name]: value });
  }

  function onSelect(event: Event) {
    const raw = (event.currentTarget as HTMLSelectElement).value;
    const match = options?.find((o) => String(o.value) === raw);
    setValue(match ? match.value : raw);
  }
</script>

{#if f.current}
  <label class="row">
    <span class="name">{name}</span>
    {#if f.current.isComputed}
      <code class="json">{JSON.stringify(f.current.value)}</code>
      <span class="computed">computed</span>
    {:else if options}
      <select value={String(f.current.value)} onchange={onSelect}>
        {#each options as option (String(option.value))}
          <option value={String(option.value)}>{option.label ?? String(option.value)}</option>
        {/each}
      </select>
    {:else if typeof f.current.value === 'number'}
      <input
        type="number"
        value={f.current.value}
        onchange={(e) => setValue(Number(e.currentTarget.value))}
      />
    {:else if typeof f.current.value === 'boolean'}
      <input
        type="checkbox"
        checked={f.current.value}
        onchange={(e) => setValue(e.currentTarget.checked)}
      />
    {:else if typeof f.current.value === 'string' || f.current.value === undefined}
      <input
        type="text"
        value={f.current.value ?? ''}
        oninput={(e) => setValue(e.currentTarget.value)}
      />
    {:else}
      <code class="json">{JSON.stringify(f.current.value)}</code>
    {/if}
    {#if f.current.error}
      <span class="error">{f.current.error.message}</span>
    {/if}
  </label>
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.25rem 0;
  }
  .name {
    width: 10rem;
    font-family: monospace;
    font-size: 0.85rem;
  }
  .json {
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }
  .error {
    color: #c0392b;
    font-size: 0.8rem;
  }
  .computed {
    color: #888;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
