<script lang="ts">
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import type { Snippet } from 'svelte';

  const { children }: { children: Snippet } = $props();

  const pages = [
    { href: '/docs/why', label: 'Why form-graph' },
    { href: '/docs', label: 'Getting started' },
    { href: '/docs/concepts', label: 'Core concepts' },
    { href: '/docs/server', label: 'Server parsing' },
    { href: '/docs/svelte', label: 'Svelte binding' },
    { href: '/docs/react', label: 'React binding' },
  ];

  // trailingSlash 'always' (GitHub Pages) means pathnames end in '/'.
  const path = $derived(
    page.url.pathname.length > 1 && page.url.pathname.endsWith('/')
      ? page.url.pathname.slice(0, -1)
      : page.url.pathname
  );
</script>

<div class="flex flex-col items-start gap-10 sm:flex-row">
  <aside
    class="flex flex-row flex-wrap gap-x-4 gap-y-2 text-sm sm:sticky sm:top-4 sm:min-w-40 sm:flex-col"
  >
    {#each pages as { href, label } (href)}
      <a
        href="{base}{href}"
        class="no-underline transition-colors {path === base + href
          ? 'font-semibold text-accent'
          : 'text-muted hover:text-ink'}"
      >
        {label}
      </a>
    {/each}
  </aside>
  <article
    class="prose prose-invert min-w-0 max-w-[75ch] flex-1 prose-headings:font-display prose-headings:tracking-tight prose-a:text-accent prose-strong:text-ink prose-pre:bg-surface prose-pre:border prose-pre:border-line"
  >
    {@render children()}
  </article>
</div>
