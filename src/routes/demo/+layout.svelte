<script lang="ts">
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';

  const { children }: { children: Snippet } = $props();
</script>

<nav class="subnav">
  <a href="/demo" class:active={page.url.pathname === '/demo'}>Typed controls</a>
  <a href="/demo/dynamic" class:active={page.url.pathname === '/demo/dynamic'}>Schema-driven</a>
</nav>

{@render children()}

<style>
  .subnav {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    font-size: 0.9rem;
  }
  .subnav a {
    text-decoration: none;
    color: #555;
    padding-bottom: 0.2rem;
  }
  .subnav a.active {
    color: #000;
    font-weight: 600;
    border-bottom: 2px solid #000;
  }
</style>
