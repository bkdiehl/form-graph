<script lang="ts">
  import { field, elementPath } from '$lib/svelte/index.js';
  import type { AnyFormStore } from '$lib/core/index.js';
  import type { EnumDefMeta, SliderDefMeta } from '$lib/core/index.js';

  // One invoice row. `elementPath` fixes the element's dotted paths once;
  // every handle below subscribes to ITS OWN element — editing this row
  // never wakes a sibling, and add/remove/reorder never re-renders survivors
  // (the render-isolation contract, same machinery as root fields).
  const {
    store,
    id,
    index,
    count,
    currencySymbol,
    onremove,
    onduplicate,
    onmoveup,
    onmovedown,
  }: {
    store: AnyFormStore;
    id: string;
    index: number;
    count: number;
    currencySymbol: string;
    onremove: () => void;
    onduplicate: () => void;
    onmoveup: () => void;
    onmovedown: () => void;
  } = $props();

  const p = $derived(elementPath('items', id));
  const description = $derived(field<string>(store, p('description')));
  const kind = $derived(field<string, EnumDefMeta<string>>(store, p('kind')));
  // arm fields: null while the row is on the other branch — the graph decides
  const hours = $derived(field<number, SliderDefMeta>(store, p('hours')));
  const rate = $derived(field<number>(store, p('rate')));
  const sku = $derived(field<string>(store, p('sku')));
  const quantity = $derived(field<number, SliderDefMeta>(store, p('quantity')));
  const unitPrice = $derived(field<number>(store, p('unitPrice')));
  const lineTotal = $derived(field<number>(store, p('lineTotal')));
</script>

<div class="flex flex-col gap-2 rounded-lg border border-line px-4 py-3">
  <div class="flex items-center gap-2">
    <span class="font-mono text-xs text-muted">{index + 1}.</span>
    <input
      type="text"
      placeholder="Description"
      class="flex-1 rounded border border-line bg-surface px-2 py-1 text-sm"
      value={description.current?.value ?? ''}
      oninput={(e) => store.set({ [p('description')]: e.currentTarget.value })}
    />
    {#if kind.current?.meta}
      <select
        class="rounded border border-line bg-surface px-2 py-1 text-sm"
        value={kind.current.value}
        onchange={(e) => store.set({ [p('kind')]: e.currentTarget.value })}
      >
        {#each kind.current.meta.options as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    {/if}
    <span class="w-24 text-right font-mono text-sm"
      >{currencySymbol}{(lineTotal.current?.value ?? 0).toLocaleString()}</span
    >
    <span class="flex gap-1">
      <button type="button" class="row-op" title="Move up" disabled={index === 0} onclick={onmoveup}
        >↑</button
      >
      <button
        type="button"
        class="row-op"
        title="Move down"
        disabled={index === count - 1}
        onclick={onmovedown}>↓</button
      >
      <button type="button" class="row-op" title="Duplicate" onclick={onduplicate}>⧉</button>
      <button type="button" class="row-op" title="Remove" onclick={onremove}>✕</button>
    </span>
  </div>

  {#if description.current?.error}
    <span class="pl-6 text-xs text-problem">{description.current.error.message}</span>
  {/if}

  <div class="flex items-center gap-4 pl-6">
    {#if hours.current?.meta}
      <label class="flex items-center gap-2 text-sm">
        <span class="font-mono text-xs text-muted">hours</span>
        <input
          type="number"
          min={hours.current.meta.min}
          max={hours.current.meta.max}
          class="w-16 rounded border border-line bg-surface px-2 py-1 text-sm"
          value={hours.current.value}
          oninput={(e) => store.set({ [p('hours')]: e.currentTarget.value })}
        />
      </label>
    {/if}
    {#if rate.current}
      <label class="flex items-center gap-2 text-sm">
        <span class="font-mono text-xs text-muted">rate</span>
        <input
          type="number"
          class="w-20 rounded border border-line bg-surface px-2 py-1 text-sm"
          value={rate.current.value}
          oninput={(e) => store.set({ [p('rate')]: e.currentTarget.value })}
        />
      </label>
    {/if}

    {#if sku.current}
      <label class="flex items-center gap-2 text-sm">
        <span class="font-mono text-xs text-muted">sku</span>
        <input
          type="text"
          placeholder="ABC-123"
          class="w-24 rounded border border-line bg-surface px-2 py-1 text-sm {sku.current.error
            ? 'border-problem'
            : ''}"
          value={sku.current.value}
          oninput={(e) => store.set({ [p('sku')]: e.currentTarget.value })}
        />
      </label>
      {#if sku.current.error}
        <span class="text-xs text-problem">{sku.current.error.message}</span>
      {/if}
    {/if}
    {#if quantity.current?.meta}
      <label class="flex items-center gap-2 text-sm">
        <span class="font-mono text-xs text-muted">qty</span>
        <input
          type="number"
          min={quantity.current.meta.min}
          max={quantity.current.meta.max}
          class="w-16 rounded border border-line bg-surface px-2 py-1 text-sm"
          value={quantity.current.value}
          oninput={(e) => store.set({ [p('quantity')]: e.currentTarget.value })}
        />
      </label>
    {/if}
    {#if unitPrice.current}
      <label class="flex items-center gap-2 text-sm">
        <span class="font-mono text-xs text-muted">unit</span>
        <input
          type="number"
          class="w-20 rounded border border-line bg-surface px-2 py-1 text-sm"
          value={unitPrice.current.value}
          oninput={(e) => store.set({ [p('unitPrice')]: e.currentTarget.value })}
        />
      </label>
    {/if}
  </div>
</div>

<style>
  .row-op {
    cursor: pointer;
    border-radius: 0.25rem;
    border: 1px solid var(--color-line, #ddd);
    background: var(--color-surface, #fff);
    padding: 0.125rem 0.4rem;
    font-size: 0.75rem;
    transition: border-color 0.15s;
  }
  .row-op:hover:not(:disabled) {
    border-color: var(--color-accent, #888);
  }
  .row-op:disabled {
    cursor: default;
    opacity: 0.4;
  }
</style>
