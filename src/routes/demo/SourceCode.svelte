<script lang="ts">
  const { code, filename }: { code: string; filename: string } = $props();
  const lines = $derived((code.match(/class="line"/g) ?? { length: 1 }).length);
</script>

<details class="source-code mt-8 rounded-lg border border-line bg-surface">
  <summary
    class="cursor-pointer px-4 py-2.5 font-mono text-xs tracking-widest text-muted uppercase select-none hover:text-ink"
  >
    view source — {filename} <span class="text-faint normal-case">({lines} lines)</span>
  </summary>
  <div class="overflow-x-auto border-t border-line p-4">
    <!-- eslint-disable-next-line svelte/no-at-html-tags — build-time shiki output of our own source files -->
    {@html code}
  </div>
</details>

<style>
  .source-code :global(pre.shiki) {
    margin: 0;
    padding: 0;
    border: 0;
    background-color: transparent !important;
    font-size: 0.8125rem;
    line-height: 1.6;
  }
</style>
