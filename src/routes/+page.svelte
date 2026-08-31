<script lang="ts">
  import { base } from '$app/paths';
</script>

<main>
  <h1 class="font-display text-4xl font-bold tracking-tight text-balance">
    Branch-routed forms with one definition, both sides
  </h1>
  <p class="mt-5 max-w-[65ch] leading-relaxed text-muted">
    form-graph is a contract engine for forms whose <em class="text-ink">shape depends on their
    own values</em> — selecting a workflow changes which fields exist, with defaults, per-branch
    memory, and coupling rules. You declare the fields as a graph; TypeScript infers the
    discriminated union from it; the same definition IS the client store and parses raw input on
    the server.
  </p>

  <pre class="mt-8">{`import { z } from 'zod';
import { defineGraph, branchOn } from 'form-graph';
import { enumOf, slider } from 'form-graph/defs';

const create = defineGraph<{ maxSteps: number }>()
  .field('prompt', {
    input: z.string().optional(),
    output: z.string().min(1, 'Prompt is required'),
    default: '',
  })
  .field('steps', ({ _ext }) => slider({ min: 1, max: _ext.maxSteps, default: 25 }));

const upscale = defineGraph<{ maxSteps: number }>()
  .field('scale', slider({ min: 2, max: 4, default: 2 }));

// the discriminator field routes between the graphs — the union is inferred
export const form = branchOn('workflow', WORKFLOW, { create, upscale });

// Client: a live store with per-field subscriptions and persistent intent.
const store = form.createStore({ ext: { maxSteps: 50 } });

// Server: the same pipeline over raw input. No second schema.
const result = form.parse(rawBody, { maxSteps: 50 });`}</pre>

  <h2 class="font-display mt-12 text-xl font-semibold">What it does that form libraries don't</h2>
  <ul class="mt-4 flex max-w-[68ch] flex-col gap-3 leading-relaxed text-muted">
    <li>
      <strong class="font-medium text-ink">The union is inferred, not annotated.</strong> Each
      branch graph resolves to a different shape; consumers narrow on the discriminant like any
      TypeScript union. Cost scales with branch <em>width</em>, not nesting depth.
    </li>
    <li>
      <strong class="font-medium text-ink">Identical output client and server.</strong>
      <code>parse()</code> runs the same resolve → validate pipeline the store runs, so what the
      UI shows is what the server accepts.
    </li>
    <li>
      <strong class="font-medium text-ink">Scoped, persistent intent.</strong> User choices are
      remembered per scope (per-branch, per-group) and survive branch switches — return to a
      branch and your values are back.
    </li>
    <li>
      <strong class="font-medium text-ink">Lenient boundaries, strict output.</strong> Dual
      schemas per field: stored/remixed/raw values parse leniently and fall back to defaults;
      submit validates strictly, with every issue and its path.
    </li>
    <li>
      <strong class="font-medium text-ink">Framework-agnostic by construction.</strong> All
      semantics live in the core store; the React and Svelte bindings are each a thin bridge over
      the same per-field subscriptions.
    </li>
  </ul>

  <p class="mt-10 leading-relaxed text-muted">
    <a href="{base}/docs/why" class="text-accent">Why this exists</a>,
    <a href="{base}/docs" class="text-accent">the docs</a>, or
    <a href="{base}/demo" class="text-accent">the live demo</a> — a real generation-form port with 7
    workflows and 8 ecosystems, parsed server-side by a SvelteKit form action.
  </p>
</main>
