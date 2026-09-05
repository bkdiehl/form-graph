import type { FormStore } from '../core/store.js';

/**
 * Keeps a store's ext in step with reactive inputs — the Svelte twin of the
 * ext-sync half of React's `useForm`. (Creation needs no helper here: a
 * component script runs once.) Stateless on purpose: it pushes at setup —
 * catching ext that changed between store creation and mount, the SvelteKit
 * load/remount shape — and on every change of the getter's dependencies.
 * `setExt` itself no-ops on a deep-equal ext, so unconditional pushes cost
 * nothing and there is no shadow copy to fall out of sync.
 */
export function syncExt<Ext>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: FormStore<any, Ext, any, any>,
  ext: () => Ext
): void {
  store.setExt(ext());
  $effect(() => {
    store.setExt(ext());
  });
}
