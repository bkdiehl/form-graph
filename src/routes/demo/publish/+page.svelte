<script lang="ts">
  import { Field, formState } from '$lib/svelte/index.js';
  import { publishForm } from './publish-form.js';
  import Slider from '../Slider.svelte';
  import { typedFields } from '$lib/svelte/index.js';
  import SourceCode from '../SourceCode.svelte';
  import hubSource from './publish-form.ts?shiki';
  import s3Source from './s3.ts?shiki';
  import emailSource from './email.ts?shiki';
  import webhookSource from './webhook.ts?shiki';

  const store = publishForm.createStore();
  const f = typedFields(store);

  type TextKey = 'bucket' | 'recipients' | 'url' | 'secret';
  type EnumKey = 'destination' | 'region' | 'storageClass' | 'digestFrequency' | 'method';

  const snapshot = formState(store);
  const s = $derived(snapshot.current);
  const notes = $derived((snapshot.current, store.getNotes()));
  const storedIntent = $derived((snapshot.current, store.getIntent()));

  let submitted = $state<string | null>(null);
  function publish() {
    const result = store.validate();
    submitted = JSON.stringify(result.success ? result.data : { errors: result.errors }, null, 2);
  }
</script>

{#snippet textField(name: TextKey, placeholder: string)}
  <Field {store} {name}>
    {#snippet children(snap, setValue)}
      <label class="flex items-center gap-3 py-1.5">
        <span class="w-36 shrink-0 font-mono text-sm text-muted">{name}</span>
        <input
          type="text"
          class="max-w-72 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm"
          {placeholder}
          value={snap.value}
          oninput={(e) => setValue(e.currentTarget.value)}
        />
        {#if snap.error}
          <span class="text-xs text-problem">{snap.error.message}</span>
        {/if}
      </label>
    {/snippet}
  </Field>
{/snippet}

{#snippet enumField(name: EnumKey)}
  <Field {store} {name}>
    {#snippet children(snap, setValue)}
      <div class="flex items-center gap-3 py-1.5">
        <span class="w-36 shrink-0 font-mono text-sm text-muted">{name}</span>
        <span class="flex flex-wrap gap-1.5">
          {#each snap.meta?.options ?? [] as option (option.value)}
            <button
              type="button"
              disabled={option.disabled}
              class="rounded border px-3 py-1 text-sm transition-colors {snap.value === option.value
                ? 'border-accent bg-accent font-medium text-ground'
                : 'border-line bg-surface text-muted'} {option.disabled
                ? 'cursor-not-allowed opacity-40'
                : 'cursor-pointer hover:text-ink'}"
              onclick={() => setValue(option.value)}
            >
              {option.label}
            </button>
          {/each}
        </span>
      </div>
    {/snippet}
  </Field>
{/snippet}

<main>
  <h1 class="font-display text-3xl font-bold tracking-tight">Publish</h1>
  <p class="mt-4 max-w-[65ch] leading-relaxed text-muted">
    Rung five: the <em class="text-ink">hub pattern</em> — how a generator with dozens of model
    families stays sane. Each destination is a complete form in its own module (S3 even exports
    a standalone <code>s3Form</code>); the hub's <code>switch</code> on the discriminator is
    what ties them together, and its option list is built <em>from</em> the modules, so adding a
    destination is one import. Each case returns that destination's shape tagged with the
    discriminator — the state IS a discriminated union, and the panel below narrows it with a
    plain <code>if</code>. The shared <code>retries</code> key is scoped per destination:
    webhook and email each remember their own.
  </p>

  <section class="my-6 flex flex-col">
    {@render enumField('destination')}

    <div class="mt-2 border-l-2 border-line pl-4">
      {@render textField('bucket', 'my-artifacts-bucket')}
      {@render enumField('region')}
      {@render enumField('storageClass')}
      {@render textField('recipients', 'ops@example.com, dev@example.com')}
      <Field {store} name="digest">
        {#snippet children(snap, setValue)}
          <label class="flex items-center gap-3 py-1.5">
            <span class="w-36 shrink-0 font-mono text-sm text-muted">digest</span>
            <input
              type="checkbox"
              class="accent-accent"
              checked={snap.value}
              onchange={(e) => setValue(e.currentTarget.checked)}
            />
            <span class="text-xs text-faint">batch into a digest</span>
          </label>
        {/snippet}
      </Field>
      {@render enumField('digestFrequency')}
      {@render textField('url', 'https://api.example.com/hooks/publish')}
      {@render textField('secret', 'whsec_…')}
      {@render enumField('method')}
      {#if f.retries.current}
        <Slider label="retries" field={f.retries} onchange={(v) => store.set({ retries: v })} />
      {/if}
    </div>
  </section>

  <section class="my-6 rounded-lg border border-line bg-surface p-4">
    <p class="font-mono text-xs tracking-widest text-faint uppercase">
      The union, narrowed with a plain if
    </p>
    <div class="mt-2 text-sm text-muted">
      {#if s.destination === 's3'}
        Delivering to <code>{s.bucket || '(bucket unset)'}</code> in <code>{s.region}</code> as
        <code>{s.storageClass}</code>. <span class="text-faint">— `s.retries` does not compile here.</span>
      {:else if s.destination === 'email'}
        Emailing <code>{s.recipients || '(no recipients)'}</code>
        {s.digest ? `as a ${s.digestFrequency} digest` : 'immediately'}, {s.retries} retries.
      {:else}
        {s.method} to <code>{s.url || '(url unset)'}</code>, {s.retries} retries.
      {/if}
    </div>
  </section>

  {#if notes.length > 0}
    <section class="my-6 rounded-lg border border-problem/40 bg-surface p-4">
      <p class="font-mono text-xs tracking-widest text-problem uppercase">Projection notes</p>
      <ul class="mt-2 flex flex-col gap-1 text-sm text-muted">
        {#each notes as note, i (i)}
          <li>
            <code>{note.key}</code> → <code>{note.kind}</code>
            {#if note.detail}
              <span class="text-faint">{JSON.stringify(note.detail)}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="my-6 rounded-lg border border-line bg-surface p-4">
    <p class="font-mono text-xs tracking-widest text-mechanism uppercase">
      Intent — note retries&#64;email vs retries&#64;webhook
    </p>
    <pre class="mt-3 border-0 bg-transparent p-0">{JSON.stringify(storedIntent, null, 2)}</pre>
  </section>

  <button
    type="button"
    class="cursor-pointer rounded border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
    onclick={publish}
  >
    Publish (strict validate)
  </button>
  <span class="ml-3 text-xs text-faint">
    Try: set webhook retries to 8, switch to Email, set retries to 1, switch back — both
    remembered. On S3, pick ap-northeast-1 with Glacier selected.
  </span>
  {#if submitted}
    <pre class="mt-4">{submitted}</pre>
  {/if}

  <SourceCode code={hubSource} filename="publish-form.ts" />
  <SourceCode code={s3Source} filename="s3.ts" />
  <SourceCode code={emailSource} filename="email.ts" />
  <SourceCode code={webhookSource} filename="webhook.ts" />
</main>
