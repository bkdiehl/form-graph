<script
  lang="ts"
  generics="Codecs extends CodecRegistry, K extends keyof Codecs & string"
>
  import type { Snippet } from 'svelte';
  import type {
    CodecRegistry,
    FieldSnapshot,
    FormStore,
    InferCodecMeta,
    InferCodecValue,
  } from '../core/index.js';
  import { field } from './index.js';

  type Snap = FieldSnapshot<InferCodecValue<Codecs[K]>, InferCodecMeta<Codecs[K]>>;

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
    children: Snippet<[Snap, (value: InferCodecValue<Codecs[K]>) => void]>;
  } = $props();

  const handle = $derived(field<InferCodecValue<Codecs[K]>, InferCodecMeta<Codecs[K]>>(store, name));
  const setValue = (value: InferCodecValue<Codecs[K]>) => store.set({ [name]: value });
</script>

{#if handle.current}
  {@render children(handle.current, setValue)}
{/if}
