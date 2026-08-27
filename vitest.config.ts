import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import react from '@vitejs/plugin-react';

// Standalone vitest config: the library's tests don't go through SvelteKit,
// so this deliberately does NOT extend vite.config.ts. Svelte first so it
// compiles .svelte.test.ts rune modules before babel sees them.
export default defineConfig({
  // Svelte 5 ships separate client/server runtimes; without the browser
  // condition vitest loads the SERVER one, where effects are inert and every
  // reactivity test silently sees zero runs.
  resolve: {
    conditions: ['browser'],
    // The vendored v1 data-graph tree keeps its civitai-repo '~/' imports verbatim.
    alias: [
      // NodeNext (the root tsconfig) requires extensions even through path
      // aliases, so test imports write '~/x.js'; map them back to the .ts source.
      {
        find: /^~\/(.+)\.js$/,
        replacement: path.resolve(import.meta.dirname, 'src/v1/civitai') + '/$1.ts',
      },
      { find: /^~\//, replacement: path.resolve(import.meta.dirname, 'src/v1/civitai') + '/' },
    ],
  },
  plugins: [svelte(), react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/lib/**/*.test.{ts,tsx}', 'src/v1/__tests__/**/*.test.ts'],
  },
});
