<script
  lang="ts"
  generics="Codecs extends CodecRegistry, K extends keyof Codecs & string"
>
  import type { Snippet } from 'svelte';
  import type { FieldSnapshot, FormStore, InferDefMeta, InferDefValue } from '../core/index.js';
import type { CodecRegistry } from '../core/codec.js';
  import { field } from './index.js';

  type Snap = FieldSnapshot<InferDefValue<Codecs[K]>, InferDefMeta<Codecs[K]>>;

  // The v1-controller contract: place this flat on the page; the FORM decides
  // whether it renders. The snippet receives the typed snapshot plus a typed
  // setter, so no visibility logic or type annotation lives in the page.
  const {
    store,
    name,
    children,
  }: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store: FormStore<any, any, Codecs>;
    name: K;
    children: Snippet<[Snap, (value: InferDefValue<Codecs[K]>) => void]>;
  } = $props();

  const handle = $derived(field<InferDefValue<Codecs[K]>, InferDefMeta<Codecs[K]>>(store, name));
  const setValue = (value: InferDefValue<Codecs[K]>) => store.set({ [name]: value });
</script>

{#if handle.current}
  {@render children(handle.current, setValue)}
{/if}
