<script lang="ts">
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';

  const { children }: { children: Snippet } = $props();

  const tabs = [
    { href: '/demo', label: 'Typed controls' },
    { href: '/demo/dynamic', label: 'Schema-driven' },
    { href: '/demo/pizza', label: 'Pizza builder' },
    { href: '/demo/shipping', label: 'Shipping quote' },
    { href: '/demo/vm', label: 'VM configurator' },
    { href: '/demo/video', label: 'LTX + Wan (real)' },
  ];
</script>

<nav class="mb-6 flex gap-4 text-sm">
  {#each tabs as { href, label } (href)}
    <a
      {href}
      class="border-b-2 pb-1 no-underline transition-colors {page.url.pathname === href
        ? 'border-accent font-semibold text-ink'
        : 'border-transparent text-muted hover:text-ink'}"
    >
      {label}
    </a>
  {/each}
</nav>

{@render children()}
