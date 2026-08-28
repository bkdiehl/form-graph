<script lang="ts">
  import { page } from '$app/state';
  import { base } from '$app/paths';
  import type { Snippet } from 'svelte';

  const { children }: { children: Snippet } = $props();

  const tabs = [
    { href: '/demo', label: 'Typed controls' },
    { href: '/demo/dynamic', label: 'Schema-driven' },
    { href: '/demo/pizza', label: 'Pizza builder' },
    { href: '/demo/shipping', label: 'Shipping quote' },
    { href: '/demo/vm', label: 'VM configurator' },
    { href: '/demo/checkout', label: 'Checkout' },
    { href: '/demo/publish', label: 'Publish' },
  ];

  // trailingSlash 'always' (GitHub Pages) means pathnames end in '/'.
  const path = $derived(
    page.url.pathname.length > 1 && page.url.pathname.endsWith('/')
      ? page.url.pathname.slice(0, -1)
      : page.url.pathname
  );
</script>

<nav class="mb-6 flex gap-4 text-sm">
  {#each tabs as { href, label } (href)}
    <a
      href="{base}{href}"
      class="border-b-2 pb-1 no-underline transition-colors {path === base + href
        ? 'border-accent font-semibold text-ink'
        : 'border-transparent text-muted hover:text-ink'}"
    >
      {label}
    </a>
  {/each}
</nav>

{@render children()}
