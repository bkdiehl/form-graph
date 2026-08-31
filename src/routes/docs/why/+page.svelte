<script lang="ts">
  import { base } from '$app/paths';
  const hero: { code: string; note?: string }[] = [
    { code: 'resolve: (f, ext) => {' },
    { code: "  const workflow = f.field('workflow', WORKFLOW);", note: 'every conditional’s one home' },
    { code: "  const base = { workflow, prompt: f.field('prompt', PROMPT) };" },
    { code: '' },
    { code: '  switch (workflow) {', note: 'the branch IS the type' },
    { code: "    case 'upscale':" },
    { code: "      return { ...base, scale: f.field('scale', SCALE) };", note: 'this shape exists only here' },
    { code: '    default:' },
    { code: "      return { ...base, steps: f.field('steps', STEPS) };" },
    { code: '  }' },
    { code: '}' },
  ];

  const pairs: { title: string; problem: string; mechanism: string }[] = [
    {
      title: 'The conditionals end up everywhere',
      problem:
        'With a general-purpose form library, a value-dependent form has no single home for its shape. The branching leaks into every layer as its own copy of the same conditional: a <code>watch()</code> in this component to hide a field, an <code>if</code> in the validator to skip it, an effect over there to reset it, another guard in the submit handler because the hidden field’s value is still in the state object. Fifty fields deep, no one can answer “what does this form look like when mode is X?” without reading all of it.',
      mechanism:
        'The shape has exactly one home — the resolver. It declares which fields exist for the current values, and the branch is a <code>switch</code> statement, readable top to bottom. Everything else derives from that single declaration: the UI renders the fields the resolver returned, the output contains only those fields, validation runs only over them, and the types narrow to match. The conditionals don’t disappear — they collapse into the one place where they read as structure.',
    },
    {
      title: 'The type system gives out before the form does',
      problem:
        'Model a branching form as composed schemas — discriminated unions of zod objects, graphs merged into graphs — and the compiler pays for <em>nesting</em>. Every merge wraps the previous type one level deeper, and at real scale (dozens of workflows × ecosystems) TypeScript stops with “type instantiation is excessively deep” (TS2589). The type that was the whole point becomes the obstacle.',
      mechanism:
        'Branches aren’t modeled <em>in</em> the type system — they’re modeled in code, and the type system <em>observes</em> them. Each <code>switch</code> arm returns a different object literal; the inferred return type IS the discriminated union. Cost scales with the number of branches (width), not how they compose (depth). Adding branch fifty compiles like adding branch five — measured, not hoped.',
    },
    {
      title: 'Two ends of one contract, drifting',
      problem:
        'The usual split — a form library on the client, “also run zod” on the server — is two implementations of one contract, and they drift. A default added on one side, a migration applied on the other, an aspect-ratio table trimmed differently: each drift is invisible until a submission the UI considered valid is rejected — or accepted with different values.',
      mechanism:
        'There is one definition, and <code>form.parse(raw, ext)</code> runs the exact pipeline the client store runs — boundary codecs, resolution, rules, strict output validation. The server doesn’t approximate the form; it executes it. Building this library, a differential harness ran the same inputs through a legacy graph and this engine — the drifts it caught (a default only an effect applied; a table that resolved ’16:9’ to ’3:2’) are exactly the class this design deletes.',
    },
    {
      title: 'Branch switches destroy the user’s work',
      problem:
        'A user tunes steps and cfg for one model family, tries another, comes back — and everything reset, because form state only held the fields that currently exist. Teams patch this with ad-hoc localStorage keys per field, which become an undocumented persistence format that UI code reads raw.',
      mechanism:
        'State is split from <em>intent</em>. Intent is everything the user ever chose, keyed by address, never deleted when a branch deactivates; visible state is a pure function of it. A field can declare a <code>scope</code>, so its memory is per-branch or per-group (<code>steps@flux</code> vs <code>steps@sd</code>) — return to a branch and its values return with it. The persisted format is the intent record itself, with supported readers instead of raw key parsing.',
    },
    {
      title: 'One stale stored value wedges the whole form',
      problem:
        'Anything that persists choices eventually reloads a value the current config no longer accepts — a retired model id, a removed workflow key, a corrupt blob. Validate strictly on load and the form errors before the user touches it; skip validation and garbage flows into submissions.',
      mechanism:
        'Every value knows where it came from. UI writes are trusted and stored verbatim. Boundary values — storage, URLs, remixes, raw server input — run a separate <em>lenient</em> input schema, lazily, falling back to the default on failure. The <em>strict</em> output schema runs only on demand: submit, <code>output()</code>, server parse. A corrupt value can cost one field’s memory; it can never wedge the form. And since nothing schema-shaped runs during typing, keystrokes stay flat at any form size.',
    },
    {
      title: 'Silent corrections you can’t audit',
      problem:
        'Real forms correct user values: clamp a quantity to the account’s limit, substitute a retired checkpoint, force the locked model for a draft workflow. Do it silently and the server can’t tell a correction from a tampered request; error instead and you punish users for config changes they never saw.',
      mechanism:
        'Two first-class reactions, split by whose problem it is. <code>f.correct(key, value, reason)</code> replaces the value — a visible statement in the resolver, with a machine-readable reason (<code>locked_default</code>, <code>ecosystem_mismatch</code>, …) riding on every parse result, failures included. <code>refine</code> narrows the output schema in zod’s own vocabulary and refuses, with a live error. The server doesn’t diff blindly; it reads why a value moved.',
    },
    {
      title: 'Couplings become effect soup',
      problem:
        '“Selecting the draft workflow forces the draft model, and selecting the draft model forces the draft workflow” — written as reactive effects, that’s two watchers with mutual guards, ordering dependencies on the store, and a cycle waiting for the guard someone deletes.',
      mechanism:
        'Couplings are plain rule maps on <code>.effect</code>, keyed by the field whose change triggers them. Rules rewrite the patch <em>before</em> resolution, in one ordered pass per <code>set()</code>, each rule at most once, no rewind — cycles aren’t detected, they’re unrepresentable. The driver is whichever field the user actually touched, so the two directions coexist without chasing each other.',
    },
    {
      title: 'Recompute-everything re-renders everything',
      problem:
        'Deriving the whole form on every keystroke is the simplest correct model — and naively it means every control re-renders on every keystroke, which is exactly why large forms lag. The usual escape is incremental recomputation, which trades the simplicity away for dependency-tracking machinery.',
      mechanism:
        'Keep the full recompute; fix the notification. The snapshot diff is reference-preserving — a field whose data didn’t change keeps its exact object identity, and its per-field subscribers never fire. Typing in the prompt recomputes everything and wakes one control. The same reference guarantee is what lets Svelte and Vue reactivity work unmodified.',
    },
    {
      title: 'Welded to one UI framework',
      problem:
        'When the contract engine lives inside React hooks, the server can’t run it, tests need a DOM, and a second frontend means a rewrite.',
      mechanism:
        'Every semantic — resolution, rules, intent, diffing, validation — lives in a framework-free core with a subscribe/snapshot store. The React and Svelte bindings are each a few dozen lines bridging that store into their reactivity system; the demos run the same definition SvelteKit-server-side that a React app would run in the browser.',
    },
  ];
</script>

<svelte:head>
  <title>Why form-graph</title>
</svelte:head>

<div class="not-prose">
  <header>
    <p class="font-mono text-xs tracking-[0.2em] text-accent uppercase">Why form-graph</p>
    <h1 class="font-display mt-3 text-4xl font-bold tracking-tight text-balance">
      Complex forms without the spaghetti
    </h1>
    <p class="mt-5 max-w-[62ch] leading-relaxed text-muted">
      This library started from a simple frustration: building complex forms shouldn’t mean
      managing a mountain of conditionals. One kind of form breaks every general-purpose form
      tool — a form whose <em class="text-ink">shape depends on its own values</em>. Pick a
      workflow and the ecosystems change; pick an ecosystem and the fields change; pick a model
      and it can change the workflow right back.
    </p>
  </header>

  <figure class="mt-8 overflow-hidden rounded-lg border border-line bg-surface">
    <figcaption
      class="border-b border-line px-4 py-2 font-mono text-[0.65rem] tracking-widest text-faint uppercase"
    >
      The whole idea — one resolver, annotated
    </figcaption>
    <div class="overflow-x-auto p-4">
      {#each hero as line, i (i)}
        <div class="flex items-baseline gap-6 whitespace-pre">
          <code class="font-mono text-[0.78rem] leading-6 text-ink">{line.code || ' '}</code>
          {#if line.note}
            <span class="hidden shrink-0 text-xs text-accent italic sm:inline">← {line.note}</span>
          {/if}
        </div>
      {/each}
    </div>
  </figure>

  <p class="mt-8 max-w-[62ch] leading-relaxed text-muted">
    Each section below is a problem that shape actually produced in production — and the
    mechanism here that answers it.
  </p>

  <div class="mt-12 flex flex-col gap-12">
    {#each pairs as pair (pair.title)}
      <section class="border-t border-line pt-10">
        <p class="font-mono text-[0.65rem] tracking-[0.2em] text-problem uppercase">
          The problem
        </p>
        <h2 class="font-display mt-2 text-2xl font-semibold tracking-tight text-balance">
          {pair.title}
        </h2>
        <p class="mt-3 max-w-[65ch] leading-relaxed text-muted">
          {@html pair.problem}
        </p>
        <div class="mt-6 border-l-2 border-mechanism pl-5">
          <p class="font-mono text-[0.65rem] tracking-[0.2em] text-mechanism uppercase">
            The mechanism
          </p>
          <p class="mt-2 max-w-[63ch] leading-relaxed text-ink/90">
            {@html pair.mechanism}
          </p>
        </div>
      </section>
    {/each}
  </div>

  <section class="mt-14 rounded-lg border border-line bg-surface p-6">
    <p class="font-mono text-[0.65rem] tracking-[0.2em] text-accent uppercase">Scope</p>
    <h2 class="font-display mt-2 text-xl font-semibold">What this is not</h2>
    <p class="mt-3 max-w-[65ch] leading-relaxed text-muted">
      form-graph is a contract engine, not a UI kit. It has no field-array choreography, no
      wizard steps, no focus management — a form whose shape is static and whose fields are
      independent is well served by the established form libraries, and pairing one of them with
      a single form-graph field is a supported pattern, not a workaround. The line: if a feature
      changes what the parsed output <em class="text-ink">means</em> or how a value is
      <em class="text-ink">remembered</em>, it belongs here; if its subject is how the user moves
      through the UI, it doesn’t.
    </p>
    <p class="mt-4 text-sm">
      <a href="{base}/docs" class="text-accent">Getting started →</a>
    </p>
  </section>
</div>
