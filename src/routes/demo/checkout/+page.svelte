<script lang="ts">
  import { Field, formState } from '$lib/svelte/index.js';
  import { checkoutForm } from './checkout-form.js';
  import SourceCode from '../SourceCode.svelte';
  import parentSource from './checkout-form.ts?shiki';
  import contactSource from './contact.ts?shiki';
  import addressSource from './address.ts?shiki';
  import paymentSource from './payment.ts?shiki';

  const store = checkoutForm.createStore();

  type TextKey =
    | 'email' | 'company' | 'vatId'
    | 'shippingStreet' | 'shippingCity' | 'billingStreet' | 'billingCity'
    | 'cardNumber' | 'cardExpiry' | 'poNumber';
  type EnumKey = 'shippingCountry' | 'billingCountry' | 'paymentMethod';
  type BoolKey = 'isBusiness' | 'billingSameAsShipping';

  const snapshot = formState(store);
  const s = $derived(snapshot.current);
  const notes = $derived((snapshot.current, store.getNotes()));

  let submitted = $state<string | null>(null);
  function placeOrder() {
    const result = store.validate();
    submitted = JSON.stringify(result.success ? result.data : { errors: result.errors }, null, 2);
  }
</script>

{#snippet textField(name: TextKey, label: string, placeholder: string)}
  <Field {store} {name}>
    {#snippet children(snap, setValue)}
      <label class="flex items-center gap-3 py-1.5">
        <span class="w-40 shrink-0 font-mono text-sm text-muted">{label}</span>
        <input
          type="text"
          class="max-w-64 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm"
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
        <span class="w-40 shrink-0 font-mono text-sm text-muted">{name}</span>
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

{#snippet checkboxField(name: BoolKey, hint: string)}
  <Field {store} {name}>
    {#snippet children(snap, setValue)}
      <label class="flex items-center gap-3 py-1.5">
        <span class="w-40 shrink-0 font-mono text-sm text-muted">{name}</span>
        <input
          type="checkbox"
          class="accent-accent"
          checked={snap.value}
          onchange={(e) => setValue(e.currentTarget.checked)}
        />
        <span class="text-xs text-faint">{hint}</span>
      </label>
    {/snippet}
  </Field>
{/snippet}

<main>
  <h1 class="font-display text-3xl font-bold tracking-tight">Checkout</h1>
  <p class="mt-4 max-w-[65ch] leading-relaxed text-muted">
    Rung four: <em class="text-ink">composition</em>. Contact, address and payment are defined in
    separate modules that know nothing about each other — each is an ordinary graph (contact
    carries its own rules). The parent mounts them with <code>.use</code> and owns only what no
    section can know alone: billing mirrors shipping unless
    unchecked (the address section is instantiated <em>twice</em>, under different keys, each
    with its own memory), and invoicing is passed down to the payment section as
    <code>allowInvoice</code> from the contact section's answer. There is no subform machinery —
    a resolver is a function, and functions compose.
  </p>

  <section class="my-6 flex flex-col">
    <p class="mt-2 font-mono text-xs tracking-widest text-faint uppercase">contact — contact.ts</p>
    {@render textField('email', 'email', 'you@example.com')}
    {@render checkboxField('isBusiness', 'unlocks company, VAT and invoicing')}
    {@render textField('company', 'company', 'ACME GmbH')}
    {@render textField('vatId', 'vatId', 'DE812526315')}

    <p class="mt-4 font-mono text-xs tracking-widest text-faint uppercase">
      shipping — address.ts
    </p>
    {@render textField('shippingStreet', 'shippingStreet', '1 Main St')}
    {@render textField('shippingCity', 'shippingCity', 'Springfield')}
    {@render enumField('shippingCountry')}

    <p class="mt-4 font-mono text-xs tracking-widest text-faint uppercase">
      billing — address.ts, second instance
    </p>
    {@render checkboxField('billingSameAsShipping', 'uncheck to mount the section again')}
    {@render textField('billingStreet', 'billingStreet', '2 Ledger Ave')}
    {@render textField('billingCity', 'billingCity', 'Accounting')}
    {@render enumField('billingCountry')}

    <p class="mt-4 font-mono text-xs tracking-widest text-faint uppercase">
      payment — payment.ts
    </p>
    {@render enumField('paymentMethod')}
    {@render textField('cardNumber', 'cardNumber', '4242 4242 4242 4242')}
    {@render textField('cardExpiry', 'cardExpiry', '12/28')}
    {@render textField('poNumber', 'poNumber', 'PO-1042')}
  </section>

  <section class="my-6 rounded-lg border border-line bg-surface p-4">
    <dl class="flex flex-wrap gap-8 text-sm">
      <div>
        <dt class="text-xs text-faint">items</dt>
        <dd class="tabular-nums">$120.00</dd>
      </div>
      <div>
        <dt class="text-xs text-faint">shipping ({s.shipping.country})</dt>
        <dd class="tabular-nums">${s.shippingCost.toFixed(2)}</dd>
      </div>
      <div>
        <dt class="text-xs text-faint">payment fee</dt>
        <dd class="tabular-nums">${s.paymentFee.toFixed(2)}</dd>
      </div>
      <div>
        <dt class="text-xs text-faint">total</dt>
        <dd class="font-medium tabular-nums">${s.total.toFixed(2)}</dd>
      </div>
    </dl>
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

  <button
    type="button"
    class="cursor-pointer rounded border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
    onclick={placeOrder}
  >
    Place order (strict validate)
  </button>
  <span class="ml-3 text-xs text-faint">
    Try: check isBusiness, pick Invoice, then uncheck isBusiness — the parent corrects the
    payment section. Uncheck billingSameAsShipping, fill billing, re-check, uncheck again: the
    second instance kept its own memory.
  </span>
  {#if submitted}
    <pre class="mt-4">{submitted}</pre>
  {/if}

  <SourceCode code={parentSource} filename="checkout-form.ts" />
  <SourceCode code={contactSource} filename="contact.ts" />
  <SourceCode code={addressSource} filename="address.ts" />
  <SourceCode code={paymentSource} filename="payment.ts" />
</main>
