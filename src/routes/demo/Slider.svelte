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
  <label class="flex items-center gap-3 py-1.5">
    <span class="w-28 font-mono text-sm text-muted">{label}</span>
    <input
      type="range"
      class="max-w-64 flex-1 accent-accent"
      min={field.current.meta.min}
      max={field.current.meta.max}
      step={field.current.meta.step}
      value={field.current.value}
      oninput={(e) => onchange(Number(e.currentTarget.value))}
    />
    <span class="min-w-10 text-sm tabular-nums">{field.current.value}</span>
    {#if field.current.error}
      <span class="text-xs text-problem">{field.current.error.message}</span>
    {/if}
    {#if field.current.note}
      <span class="text-xs text-accent">
        adjusted from {String(field.current.note.detail?.from)} — {field.current.note.kind}
      </span>
    {/if}
  </label>
{/if}
