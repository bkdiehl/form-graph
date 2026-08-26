<script lang="ts">
  import type { FieldSnapshot } from '$lib/index.js';
  import type { SliderMeta } from '$lib/codecs/index.js';
  import type { Reactive } from '$lib/svelte/index.js';

  // Typed at the boundary: this control only accepts a number/SliderMeta field,
  // so wiring it to the wrong key is a compile error, not a runtime surprise.
  const {
    label,
    field,
    onchange,
  }: {
    label: string;
    field: Reactive<FieldSnapshot<number, SliderMeta> | null>;
    onchange: (value: number) => void;
  } = $props();
</script>

{#if field.current?.meta}
  <label class="row">
    <span class="name">{label}</span>
    <input
      type="range"
      min={field.current.meta.min}
      max={field.current.meta.max}
      step={field.current.meta.step}
      value={field.current.value}
      oninput={(e) => onchange(Number(e.currentTarget.value))}
    />
    <span class="value">{field.current.value}</span>
    {#if field.current.error}
      <span class="error">{field.current.error.message}</span>
    {/if}
  </label>
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.3rem 0;
  }
  .name {
    width: 7rem;
    font-family: ui-monospace, monospace;
    font-size: 0.85rem;
  }
  input {
    flex: 1;
    max-width: 16rem;
  }
  .value {
    min-width: 2.5rem;
    font-size: 0.85rem;
  }
  .error {
    color: #c0392b;
    font-size: 0.8rem;
  }
</style>
