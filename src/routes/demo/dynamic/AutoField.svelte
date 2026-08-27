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
  <label class="flex items-center gap-3 py-1">
    <span class="w-40 shrink-0 font-mono text-sm text-muted">{name}</span>
    {#if f.current.isComputed}
      <code class="text-xs break-all text-faint">{JSON.stringify(f.current.value)}</code>
      <span class="text-[0.6rem] tracking-widest text-faint uppercase">computed</span>
    {:else if options}
      <select
        class="rounded border border-line bg-surface px-2 py-1 text-sm"
        value={String(f.current.value)}
        onchange={onSelect}
      >
        {#each options as option (String(option.value))}
          <option value={String(option.value)}>{option.label ?? String(option.value)}</option>
        {/each}
      </select>
    {:else if typeof f.current.value === 'number'}
      <input
        type="number"
        class="w-28 rounded border border-line bg-surface px-2 py-1 text-sm tabular-nums"
        value={f.current.value}
        onchange={(e) => setValue(Number(e.currentTarget.value))}
      />
    {:else if typeof f.current.value === 'boolean'}
      <input
        type="checkbox"
        class="accent-accent"
        checked={f.current.value}
        onchange={(e) => setValue(e.currentTarget.checked)}
      />
    {:else if typeof f.current.value === 'string' || f.current.value === undefined}
      <input
        type="text"
        class="max-w-64 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm"
        value={f.current.value ?? ''}
        oninput={(e) => setValue(e.currentTarget.value)}
      />
    {:else}
      <code class="text-xs break-all text-faint">{JSON.stringify(f.current.value)}</code>
    {/if}
    {#if f.current.error}
      <span class="text-xs text-problem">{f.current.error.message}</span>
    {/if}
  </label>
{/if}
