<script lang="ts">
  import { base } from '$app/paths';
</script>

<h1>Server parsing</h1>

<p>
  <code>form.parse(raw, ext)</code> is the server entry point, and it is the same pipeline the
  client walks: boundary codecs → resolve → strict output validation. Pure — no store, no shared
  state.
</p>

<pre>{`const result = form.parse(rawBody, ext);

if (!result.success) {
  // result.errors: Record<string, FieldError>
  // FieldError = { message, code, issues: SchemaIssue[] }
  // every issue survives, with path relative to the field —
  // issues[1].path === [2, 'id'] means row 2's id failed.
  return badRequest(result.errors);
}

result.data;         // the discriminated union, strict-validated
result.computedKeys; // which keys were derived, not user input
result.notes;        // substitution notes (see below)`}</pre>

<h2>SvelteKit form action</h2>

<pre>{`// +page.server.ts
export const actions = {
  default: async ({ request }) => {
    const raw = JSON.parse(String((await request.formData()).get('state')));
    const result = form.parse(raw, ext);
    if (!result.success) return fail(400, { errors: result.errors });
    return { data: result.data };
  },
};`}</pre>

<p>This exact pattern runs the <a href="{base}/demo">live demo</a>.</p>

<h2>Substitution notes</h2>
<p>
  When an <code>f.correct</code> statement replaces a value — a retired model swapped for the default, a quantity
  clamped to a limit — the field can attach a note with a machine-readable reason. Notes ride on
  the parse result (on failures too), so the server can log, bill, or refuse based on <em>why</em>
  a value changed rather than diffing blindly.
</p>

<pre>{`for (const note of result.notes ?? []) {
  // { key, reason: 'locked_default' | 'ecosystem_mismatch' | ..., detail }
}`}</pre>

<h2>Partial parse</h2>
<p>
  <code>form.parsePartial(raw, ext)</code> returns every valid field plus the errors — for cost
  estimation and other best-effort reads where one bad field shouldn't void the rest.
</p>

<h2>Introspection</h2>
<p>
  Because branches are plain code, enumeration is execution: <code>enumerateBranches</code> walks
  the reachable branch space, <code>hasField</code> / <code>whereFieldExists</code> answer
  "does this field exist under these pins", and <code>fieldMeta</code> resolves one field's
  metadata under pinned values — all without a store.
</p>
