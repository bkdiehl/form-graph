<script lang="ts">
  import { page } from '$app/state';
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
</script>

<div class="docs">
  <aside>
    {#each pages as { href, label } (href)}
      <a {href} class:active={page.url.pathname === href}>{label}</a>
    {/each}
  </aside>
  <article>
    {@render children()}
  </article>
</div>

<style>
  .docs {
    display: flex;
    gap: 2.5rem;
    align-items: flex-start;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 10rem;
    position: sticky;
    top: 1rem;
  }
  aside a {
    text-decoration: none;
    color: #555;
    font-size: 0.9rem;
  }
  aside a.active {
    color: #000;
    font-weight: 600;
  }
  article {
    min-width: 0;
    flex: 1;
  }
  @media (max-width: 640px) {
    .docs {
      flex-direction: column;
    }
    aside {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 1rem;
      position: static;
    }
  }
</style>
