<script lang="ts">
  import '../app.css';
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';

  const { children }: { children: Snippet } = $props();

  const links = [
    { href: '/docs', label: 'Docs' },
    { href: '/demo', label: 'Demo' },
  ];
</script>

<div class="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
  <header class="mb-10 flex items-baseline gap-6 border-b border-line py-5">
    <a href="/" class="font-display text-lg font-bold tracking-tight text-ink no-underline">
      form-graph
    </a>
    <nav class="flex gap-4 text-sm">
      {#each links as { href, label } (href)}
        <a
          {href}
          class="no-underline transition-colors {page.url.pathname.startsWith(href)
            ? 'text-accent'
            : 'text-muted hover:text-ink'}"
        >
          {label}
        </a>
      {/each}
    </nav>
  </header>
  {@render children()}
</div>
