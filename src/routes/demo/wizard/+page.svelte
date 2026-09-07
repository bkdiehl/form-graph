<script lang="ts">
  import { elementPath, field, formState, list } from '$lib/svelte/index.js';
  import { focusFirstError, type EnumDefMeta, type SliderDefMeta } from '$lib/core/index.js';
  import SourceCode from '../SourceCode.svelte';
  import formSource from './job-form.ts?shiki';
  import { jobForm, STEPS } from './job-form.js';

  const store = jobForm.createStore({ ext: undefined, revalidate: 'touched' });

  let step = $state(0);
  let submitted = $state<string | null>(null);

  // THE wizard mechanic: "Next" validates this step's keys and nothing else.
  // A failing field surfaces its error in place; later steps stay unscolded.
  function next() {
    const keys = STEPS[step].keys;
    if (keys.length > 0 && !store.validate(keys).success) {
      focusFirstError(store, keys); // jump to the first offender, this step only
      return;
    }
    step += 1;
    submitted = null;
  }
  function back() {
    step -= 1;
    submitted = null;
  }
  function submit() {
    const result = store.validate();
    submitted = JSON.stringify(result.success ? result.data : { errors: result.errors }, null, 2);
  }

  const title = field<string>(store, 'title');
  const company = field<string>(store, 'company');
  const remote = field<boolean>(store, 'remote');
  const employmentType = field<string, EnumDefMeta<string>>(store, 'employmentType');
  const salary = field<number, SliderDefMeta>(store, 'salary');
  const equity = field<boolean>(store, 'equity');
  const hourlyRate = field<number, SliderDefMeta>(store, 'hourlyRate');
  const maxHours = field<number, SliderDefMeta>(store, 'maxHours');
  const questions = list(store, 'questions');

  const snapshot = formState(store);
  const s = $derived(snapshot.current as Record<string, unknown>);

  const money = (n: number) => '$' + n.toLocaleString();
</script>

{#snippet textRow(label: string, handle: { current: { value: unknown; error?: { message: string } | undefined } | null }, key: string)}
  <label class="flex items-center gap-3 py-1.5">
    <span class="w-32 font-mono text-sm text-muted">{label}</span>
    <input
      type="text"
      data-fg-field={key}
      class="max-w-64 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm"
      value={String(handle.current?.value ?? '')}
      oninput={(e) => store.set({ [key]: e.currentTarget.value })}
    />
    {#if handle.current?.error}
      <span class="text-xs text-problem">{handle.current.error.message}</span>
    {/if}
  </label>
{/snippet}

{#snippet sliderRow(label: string, handle: { current: { value: number; meta?: { min: number; max: number; step: number } | undefined } | null }, key: string, format: (n: number) => string)}
  {#if handle.current?.meta}
    <label class="flex items-center gap-3 py-1.5">
      <span class="w-32 font-mono text-sm text-muted">{label}</span>
      <input
        type="range"
        min={handle.current.meta.min}
        max={handle.current.meta.max}
        step={handle.current.meta.step}
        value={handle.current.value}
        oninput={(e) => store.set({ [key]: Number(e.currentTarget.value) })}
      />
      <span class="w-24 font-mono text-sm">{format(handle.current.value)}</span>
    </label>
  {/if}
{/snippet}

<main>
  <h1 class="font-display text-3xl font-bold tracking-tight">Job posting wizard</h1>
  <p class="mt-4 max-w-[65ch] leading-relaxed text-muted">
    One graph, zero wizard awareness: the steps are key lists declared <em>next to the UI</em>
    (see <code>STEPS</code> in the source), and each "Next" is
    <code>store.validate(step.keys)</code> — it judges only that step's fields, so step 3's
    requireds can't scold on step 1, and going back shows everything remembered. Step 2 branches
    on employment type; its key list names <em>both</em> arms — the inactive one is vacuously
    valid. Step 3's gate is a whole <code>list()</code>. The store runs
    <code>revalidate: 'touched'</code>: after a failed "Next" surfaces an error (and
    <code>focusFirstError</code> jumps to it), fixing the field clears it as you type.
  </p>

  <nav class="my-6 flex gap-2">
    {#each STEPS as { label }, index (label)}
      <span
        class="rounded-full border px-3 py-1 text-sm {index === step
          ? 'border-accent bg-accent font-medium text-ground'
          : index < step
            ? 'border-line bg-surface text-ink'
            : 'border-line bg-surface text-muted'}"
      >
        {index + 1}. {label}
      </span>
    {/each}
  </nav>

  <section class="my-6 flex min-h-40 flex-col">
    {#if step === 0}
      {@render textRow('title', title, 'title')}
      {@render textRow('company', company, 'company')}
      <label class="flex items-center gap-3 py-1.5">
        <span class="w-32 font-mono text-sm text-muted">remote</span>
        <input
          type="checkbox"
          checked={remote.current?.value ?? false}
          onchange={(e) => store.set({ remote: e.currentTarget.checked })}
        />
      </label>
    {:else if step === 1}
      {#if employmentType.current?.meta}
        <div class="flex items-center gap-3 py-1.5">
          <span class="w-32 font-mono text-sm text-muted">type</span>
          <span class="flex gap-1.5">
            {#each employmentType.current.meta.options as option (option.value)}
              <button
                type="button"
                class="cursor-pointer rounded border px-3 py-1 text-sm transition-colors {employmentType
                  .current?.value === option.value
                  ? 'border-accent bg-accent font-medium text-ground'
                  : 'border-line bg-surface text-muted hover:text-ink'}"
                onclick={() => store.set({ employmentType: option.value })}
              >
                {option.label}
              </button>
            {/each}
          </span>
        </div>
      {/if}
      {@render sliderRow('salary', salary, 'salary', money)}
      {#if equity.current}
        <label class="flex items-center gap-3 py-1.5">
          <span class="w-32 font-mono text-sm text-muted">equity</span>
          <input
            type="checkbox"
            checked={equity.current.value}
            onchange={(e) => store.set({ equity: e.currentTarget.checked })}
          />
        </label>
      {/if}
      {@render sliderRow('hourlyRate', hourlyRate, 'hourlyRate', money)}
      {@render sliderRow('maxHours', maxHours, 'maxHours', (n) => `${n}h/wk`)}
      <p class="mt-2 text-xs text-muted">
        Switch type, tune the sliders, switch back — each arm remembers its own values (scoped
        intent), and the step's key list covers both arms.
      </p>
    {:else if step === 2 && questions.current}
      {#each questions.current.ids as id, index (id)}
        {@const p = elementPath('questions', id)}
        {@const prompt = field<string>(store, p('prompt'))}
        {@const kind = field<string, EnumDefMeta<string>>(store, p('kind'))}
        <div class="flex items-center gap-2 py-1.5">
          <span class="font-mono text-xs text-muted">{index + 1}.</span>
          <input
            type="text"
            placeholder="Screening question"
            data-fg-field={p('prompt')}
            class="max-w-80 flex-1 rounded border border-line bg-surface px-2 py-1 text-sm"
            value={prompt.current?.value ?? ''}
            oninput={(e) => store.set({ [p('prompt')]: e.currentTarget.value })}
          />
          {#if kind.current?.meta}
            <select
              class="rounded border border-line bg-surface px-2 py-1 text-sm"
              value={kind.current.value}
              onchange={(e) => store.set({ [p('kind')]: e.currentTarget.value })}
            >
              {#each kind.current.meta.options as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          {/if}
          <button
            type="button"
            class="cursor-pointer rounded border border-line bg-surface px-2 py-0.5 text-xs transition-colors hover:border-accent"
            onclick={() => questions.current?.remove(id)}
          >
            ✕
          </button>
          {#if prompt.current?.error}
            <span class="text-xs text-problem">{prompt.current.error.message}</span>
          {/if}
        </div>
      {/each}
      <div class="mt-2">
        <button
          type="button"
          class="cursor-pointer rounded border border-line bg-surface px-3 py-1.5 text-sm transition-colors hover:border-accent"
          onclick={() => questions.current?.add()}
        >
          + Add question
        </button>
      </div>
      <p class="mt-2 text-xs text-muted">
        This step's gate is <code>validate('questions')</code> — one key that expands to every
        question's fields. Leave one blank and try Next.
      </p>
    {:else if step === 3}
      <div class="rounded-lg border border-line px-4 py-3 text-sm leading-relaxed">
        <p>
          <strong>{String(s.title || '(untitled)')}</strong> at
          <strong>{String(s.company || '(no company)')}</strong>
          {s.remote ? '· remote' : '· on-site'}
        </p>
        {#if s.employmentType === 'fullTime'}
          <p>Full-time — {money(Number(s.salary))}{s.equity ? ' + equity' : ''}</p>
        {:else}
          <p>Contract — {money(Number(s.hourlyRate))}/h, up to {String(s.maxHours)}h/wk</p>
        {/if}
        <p class="text-muted">
          {(s.questions as Array<{ prompt: string }>).length} screening question(s)
        </p>
      </div>
    {/if}
  </section>

  <div class="flex items-center gap-3">
    {#if step > 0}
      <button
        type="button"
        class="cursor-pointer rounded border border-line bg-surface px-4 py-2 text-sm transition-colors hover:border-accent"
        onclick={back}
      >
        ← Back
      </button>
    {/if}
    {#if step < STEPS.length - 1}
      <button
        type="button"
        class="cursor-pointer rounded border border-accent bg-accent px-4 py-2 text-sm font-medium text-ground"
        onclick={next}
      >
        Next →
      </button>
    {:else}
      <button
        type="button"
        class="cursor-pointer rounded border border-accent bg-accent px-4 py-2 text-sm font-medium text-ground"
        onclick={submit}
      >
        Submit (full validate)
      </button>
    {/if}
  </div>
  {#if submitted}
    <pre class="mt-4">{submitted}</pre>
  {/if}

  <SourceCode code={formSource} filename="job-form.ts" />
</main>
