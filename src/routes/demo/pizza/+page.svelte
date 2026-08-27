<script lang="ts">
  import { persistedStorage } from '$lib/index.js';
  import { Field, formState } from '$lib/svelte/index.js';
  import { pizzaForm, SIZES, TOPPINGS } from './pizza-form.js';

  // persistedStorage: JSON localStorage backend, debounced writes, and a
  // synchronous flush on pagehide — the whole persistence story in one line.
  const storage = persistedStorage('form-graph-demo:pizza');

  const store = pizzaForm.createStore({ storage });

  const snapshot = formState(store);
  const s = $derived(snapshot.current);
  const notes = $derived((snapshot.current, store.getNotes()));

  function toggleTopping(key: 'toppings' | 'toppingsLeft' | 'toppingsRight', id: string) {
    const current = (store.getField(key)?.value ?? []) as string[];
    store.set({
      [key]: current.includes(id) ? current.filter((t) => t !== id) : [...current, id],
    });
  }

  function resetSaved() {
    localStorage.removeItem('form-graph-demo:pizza');
    location.reload();
  }
</script>

{#snippet toppingPicker(key: 'toppings' | 'toppingsLeft' | 'toppingsRight', label: string, picked: string[])}
  <div class="flex items-start gap-3 py-1.5">
    <span class="w-28 shrink-0 pt-1 font-mono text-sm text-muted">{label}</span>
    <div class="flex flex-wrap gap-1.5">
      {#each TOPPINGS as topping (topping.id)}
        <button
          type="button"
          class="cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors {picked.includes(
            topping.id
          )
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-line bg-surface text-muted hover:text-ink'}"
          onclick={() => toggleTopping(key, topping.id)}
        >
          {topping.label}
          <span class="text-faint">·{topping.weight}</span>
        </button>
      {/each}
    </div>
  </div>
{/snippet}

<main>
  <h1 class="font-display text-3xl font-bold tracking-tight">Pizza builder</h1>
  <p class="mt-4 max-w-[65ch] leading-relaxed text-muted">
    Rung one of the ladder: a form anyone can read, using every core mechanism. The crust's
    <em>options</em> depend on size and gluten-free (with your pick remembered per size); the
    topping list is projected into a per-size coverage budget with an
    <code>oven_physics</code> note when something gets dropped; calories, bake time, and price
    are computed fields. Persisted to <strong class="text-ink">localStorage</strong> — reload the
    page and your pizza survives.
  </p>

  <!-- Every control is a flat <Field> — no field conditionals in this page.
       The form decides which of these exist; a <Field> whose key is inactive
       renders nothing. -->
  <section class="my-6 flex flex-col">
    <Field {store} name="size">
      {#snippet children(snap, setValue)}
        <div class="flex items-center gap-3 py-1.5">
          <span class="w-28 font-mono text-sm text-muted">size</span>
          <span class="flex gap-1.5">
            {#each snap.meta?.options ?? [] as option (option.value)}
              <button
                type="button"
                class="cursor-pointer rounded border px-3 py-1 text-sm transition-colors {snap.value ===
                option.value
                  ? 'border-accent bg-accent font-medium text-ground'
                  : 'border-line bg-surface text-muted hover:text-ink'}"
                onclick={() => setValue(option.value)}
              >
                {option.label}
              </button>
            {/each}
          </span>
        </div>
      {/snippet}
    </Field>

    <Field {store} name="glutenFree">
      {#snippet children(snap, setValue)}
        <label class="flex items-center gap-3 py-1.5">
          <span class="w-28 font-mono text-sm text-muted">glutenFree</span>
          <input
            type="checkbox"
            class="accent-accent"
            checked={snap.value}
            onchange={(e) => setValue(e.currentTarget.checked)}
          />
        </label>
      {/snippet}
    </Field>

    <Field {store} name="crust">
      {#snippet children(snap, setValue)}
        <div class="flex items-center gap-3 py-1.5">
          <span class="w-28 font-mono text-sm text-muted">crust</span>
          <span class="flex gap-1.5">
            {#each snap.meta?.options ?? [] as option (option)}
              <button
                type="button"
                class="cursor-pointer rounded border px-3 py-1 text-sm transition-colors {snap.value ===
                option
                  ? 'border-accent bg-accent font-medium text-ground'
                  : 'border-line bg-surface text-muted hover:text-ink'}"
                onclick={() => setValue(option)}
              >
                {option}
              </button>
            {/each}
          </span>
        </div>
      {/snippet}
    </Field>

    <Field {store} name="halfAndHalf">
      {#snippet children(snap, setValue)}
        <label class="flex items-center gap-3 py-1.5">
          <span class="w-28 font-mono text-sm text-muted">halfAndHalf</span>
          <input
            type="checkbox"
            class="accent-accent"
            checked={snap.value}
            onchange={(e) => setValue(e.currentTarget.checked)}
          />
        </label>
      {/snippet}
    </Field>

    <Field {store} name="toppings">
      {#snippet children(snap)}
        {@render toppingPicker('toppings', 'toppings', snap.value)}
      {/snippet}
    </Field>
    <Field {store} name="toppingsLeft">
      {#snippet children(snap)}
        {@render toppingPicker('toppingsLeft', 'left half', snap.value)}
      {/snippet}
    </Field>
    <Field {store} name="toppingsRight">
      {#snippet children(snap)}
        {@render toppingPicker('toppingsRight', 'right half', snap.value)}
      {/snippet}
    </Field>
  </section>

  <section class="my-6 rounded-lg border border-line bg-surface p-4">
    <div class="flex items-center gap-3">
      <span class="font-mono text-xs tracking-widest text-faint uppercase">Coverage budget</span>
      <div class="h-2 max-w-64 flex-1 overflow-hidden rounded-full bg-ground">
        <div
          class="h-full rounded-full transition-all {s.budgetUsed >= s.budgetTotal
            ? 'bg-problem'
            : 'bg-mechanism'}"
          style="width: {Math.min(100, (s.budgetUsed / s.budgetTotal) * 100)}%"
        ></div>
      </div>
      <span class="text-sm tabular-nums">{s.budgetUsed} / {s.budgetTotal}</span>
    </div>
    <dl class="mt-4 flex gap-8 text-sm">
      <div>
        <dt class="text-xs text-faint">calories</dt>
        <dd class="tabular-nums">{s.calories}</dd>
      </div>
      <div>
        <dt class="text-xs text-faint">bake time</dt>
        <dd class="tabular-nums">{s.bakeMinutes} min</dd>
      </div>
      <div>
        <dt class="text-xs text-faint">price</dt>
        <dd class="tabular-nums">${s.price.toFixed(2)}</dd>
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

  <div class="flex items-center gap-4">
    <button
      type="button"
      class="cursor-pointer rounded border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
      onclick={resetSaved}
    >
      Clear saved pizza
    </button>
    <span class="text-xs text-faint">
      Try: pick toppings past the budget, shrink the size, toggle half-and-half back and forth,
      reload the page.
    </span>
  </div>
</main>
