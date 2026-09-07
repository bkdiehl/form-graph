<script lang="ts">
  import { elementPath, field, formState, list } from '$lib/svelte/index.js';
  import { persistedStorage, type EnumDefMeta } from '$lib/core/index.js';
  import SourceCode from '../SourceCode.svelte';
  import formSource from './invoice-form.ts?shiki';
  import { invoiceForm } from './invoice-form.js';
  import Row from './Row.svelte';

  const store = invoiceForm.createStore({
    ext: undefined,
    // path-keyed persistence: rows, their values and their ORDER survive a
    // reload — reload the page mid-edit and watch it come back
    storage: persistedStorage('demo:invoice'),
  });

  const items = list(store, 'items');
  const client = field<string>(store, 'client');
  const currency = field<string, EnumDefMeta<string>>(store, 'currency');
  const total = field<number>(store, 'total');

  let refusal = $state<string | null>(null);
  const attempt = (result: { success: boolean; reason?: string }) => {
    refusal = result.success ? null : `refused: ${result.reason}`;
  };

  // "Async" SKU lookup — a pretend server judging goods rows. setError is the
  // door for its verdicts into the sync engine: the error is live on the row,
  // fails validate(), and clears the moment the user edits the SKU.
  let checking = $state(false);
  function checkSkus() {
    checking = true;
    const ids = items.current?.ids ?? [];
    setTimeout(() => {
      for (const id of ids) {
        const path = elementPath('items', id);
        const sku = store.getField(path('sku'))?.value as string | undefined;
        if (sku && !/^[A-Z]{3}-\d{3}$/.test(sku)) {
          store.setError(path('sku'), { message: `Unknown SKU "${sku}" — expected ABC-123` });
        }
      }
      checking = false;
    }, 400);
  }

  let submitted = $state<string | null>(null);
  // validate('items') judges EVERY row — and nothing else: an empty client
  // passes this gate (a wizard step's "Next") and still fails the full submit
  function validateItems() {
    const result = store.validate('items');
    submitted = result.success
      ? 'items ✓ — every row is valid (client not judged: not in this scope)'
      : JSON.stringify({ errors: result.errors }, null, 2);
  }
  function validateAll() {
    const result = store.validate();
    submitted = JSON.stringify(result.success ? result.data : { errors: result.errors }, null, 2);
  }

  const money = (n: number) =>
    (currency.current?.value === 'EUR' ? '€' : '$') + n.toLocaleString();

  // isDirty/dirtyFields: the intent map IS the dirty tracker — an
  // unsaved-changes indicator is a read, not machinery
  const wholeForm = formState(store);
  const dirty = $derived((void wholeForm.current, store.dirtyFields()));
</script>

<main>
  <h1 class="font-display flex items-center gap-3 text-3xl font-bold tracking-tight">
    Invoice builder
    {#if dirty.length > 0}
      <span
        class="rounded-full border border-accent px-2.5 py-0.5 text-xs font-normal text-accent"
        title={dirty.join(', ')}
      >
        {dirty.length} unsaved change{dirty.length === 1 ? '' : 's'}
      </span>
    {/if}
  </h1>
  <p class="mt-4 max-w-[65ch] leading-relaxed text-muted">
    The <code>list()</code> demo: <code>items</code> is a collection of sub-records, each resolved
    through its own member graph — its own <code>kind</code> branch (a service row and a goods row
    are different shapes), its own submit-time errors, its own persistence. The root
    <code>total</code> computed reads the assembled rows like any other upstream value. Reload the
    page: rows, values and order come back (path-keyed storage). Source:
    <code>src/routes/demo/invoice</code>.
  </p>

  <section class="my-6 flex flex-col gap-1">
    <label class="flex items-center gap-3 py-1.5">
      <span class="w-28 font-mono text-sm text-muted">client</span>
      <input
        type="text"
        class="max-w-64 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm"
        value={client.current?.value ?? ''}
        oninput={(e) => store.set({ client: e.currentTarget.value })}
      />
      {#if client.current?.error}
        <span class="text-xs text-problem">{client.current.error.message}</span>
      {/if}
    </label>
    {#if currency.current?.meta}
      <label class="flex items-center gap-3 py-1.5">
        <span class="w-28 font-mono text-sm text-muted">currency</span>
        <select
          class="rounded border border-line bg-surface px-2 py-1 text-sm"
          value={currency.current.value}
          onchange={(e) => store.set({ currency: e.currentTarget.value })}
        >
          {#each currency.current.meta.options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
    {/if}
  </section>

  {#if items.current}
    <section class="my-6 flex flex-col gap-3">
      {#each items.current.ids as id, index (id)}
        <Row
          {store}
          {id}
          {index}
          count={items.current.ids.length}
          currencySymbol={currency.current?.value === 'EUR' ? '€' : '$'}
          onremove={() => attempt(items.current!.remove(id))}
          onduplicate={() => attempt(items.current!.duplicate(id))}
          onmoveup={() => attempt(items.current!.move(id, index - 1))}
          onmovedown={() => attempt(items.current!.move(id, index + 1))}
        />
      {/each}

      <div class="flex items-center gap-3">
        <button
          type="button"
          class="cursor-pointer rounded border border-line bg-surface px-3 py-1.5 text-sm transition-colors hover:border-accent"
          onclick={() => attempt(items.current!.add())}
        >
          + Add item
        </button>
        <button
          type="button"
          class="cursor-pointer rounded border border-line bg-surface px-3 py-1.5 text-sm transition-colors hover:border-accent"
          onclick={checkSkus}
          disabled={checking}
        >
          {checking ? 'Checking…' : 'Check SKUs (fake server)'}
        </button>
        {#if refusal}
          <span class="text-xs text-problem">{refusal}</span>
        {/if}
      </div>
      <p class="text-xs text-muted">
        The list holds 1–6 rows — the 7th add and the last remove come back as
        <code>{'{ success: false, reason }'}</code> refusals, never a broken membership. A rejected SKU
        clears the moment you edit it: a user write supersedes an external judgment.
      </p>
    </section>
  {/if}

  <section class="my-6 rounded-lg border border-line px-4 py-3">
    <div class="flex items-baseline justify-between">
      <span class="font-display text-lg font-semibold">Total</span>
      <span class="font-mono text-xl">{money(total.current?.value ?? 0)}</span>
    </div>
    <p class="mt-1 text-sm leading-relaxed text-muted">
      <code>total</code> is a root computed over the assembled rows — each row's own
      <code>lineTotal</code> computed feeds it, whichever arm the row is on.
    </p>
  </section>

  <div class="flex gap-3">
    <button
      type="button"
      class="cursor-pointer rounded border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
      onclick={validateItems}
    >
      Validate items (scoped)
    </button>
    <button
      type="button"
      class="cursor-pointer rounded border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
      onclick={validateAll}
    >
      Validate everything
    </button>
  </div>
  {#if submitted}
    <pre class="mt-4">{submitted}</pre>
  {/if}

  <SourceCode code={formSource} filename="invoice-form.ts" />
</main>
