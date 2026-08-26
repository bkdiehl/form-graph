<main>
  <h1>Branch-routed forms with one definition, both sides</h1>
  <p>
    form-graph is a contract engine for forms whose <em>shape depends on their own values</em> —
    selecting a workflow changes which fields exist, with defaults, per-branch memory, and coupling
    rules. You write one pure resolver; TypeScript infers the discriminated union from it; the same
    definition drives the client store and parses raw input on the server.
  </p>

  <pre>{`import { z } from 'zod';
import { codec, defineForm } from 'form-graph';

const PROMPT = codec<string>({
  input: z.string().optional(),
  output: z.string().min(1, 'Prompt is required'),
  default: '',
});

const form = defineForm<{ maxSteps: number }>()({
  resolve: (f, ext) => {
    const workflow = f.field('workflow', WORKFLOW);
    const base = { workflow, prompt: f.field('prompt', PROMPT) };

    switch (workflow) {                    // the switch IS the union
      case 'upscale':
        return { ...base, scale: f.field('scale', SCALE) };
      default:
        return { ...base, steps: f.field('steps', stepsCodec(ext.maxSteps)) };
    }
  },
});

// Client: a live store with per-field subscriptions and persistent intent.
const store = form.createStore({ ext: { maxSteps: 50 } });

// Server: the same pipeline over raw input. No second schema.
const result = form.parse(rawBody, { maxSteps: 50 });`}</pre>

  <h2>What it does that form libraries don't</h2>
  <ul>
    <li>
      <strong>The union is inferred, not annotated.</strong> Each branch of the resolver returns a
      different shape; consumers narrow on the discriminant like any TypeScript union. Cost scales
      with branch <em>width</em>, not nesting depth.
    </li>
    <li>
      <strong>Identical output client and server.</strong> <code>parse()</code> runs the same
      resolve → validate pipeline the store runs, so what the UI shows is what the server accepts.
    </li>
    <li>
      <strong>Scoped, persistent intent.</strong> User choices are remembered per scope
      (per-branch, per-group) and survive branch switches — return to a branch and your values are
      back.
    </li>
    <li>
      <strong>Lenient boundaries, strict output.</strong> Dual schemas per field: stored/remixed/raw
      values parse leniently and fall back to defaults; submit validates strictly, with every issue
      and its path.
    </li>
    <li>
      <strong>Framework-agnostic by construction.</strong> All semantics live in the core store;
      the React and Svelte bindings are each a thin bridge over the same per-field subscriptions.
    </li>
  </ul>

  <p>
    <a href="/docs/why">Why this exists</a>, <a href="/docs">the docs</a>, or
    <a href="/demo">the live demo</a> — a real
    generation-form port with 7 workflows and 8 ecosystems, parsed server-side by a SvelteKit form
    action.
  </p>
</main>
