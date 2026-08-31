<h1>Definitions</h1>

<p>
  A field definition is one object carrying everything the field is. Write it inline, or let a
  helper build it:
</p>

<pre>{`interface FieldDef<T, M> {
  output: SchemaLike<T>;             // strict: submit / output() / server parse
  input?: SchemaLike<T | undefined>; // lenient: storage, URLs, patches — undefined = fall to default
  default?: T | (() => T);
  meta?: M | ((value: T) => M);      // UI props; fn form for value-derived meta
  scope?: Scope;                     // where this field's memory lives
  correct?: (value: T) => { value: T; reason: string; detail?: object } | undefined;
  coerce?: (raw: unknown) => T;      // fast path for trusted writes
  toOutput?: (value: T) => unknown;  // submission projection
}`}</pre>

<h2><code>input</code> is optional — and live typing never touches it</h2>
<p>
  Session edits (<code>set()</code>) write TRUSTED intent: a half-typed invalid value is held
  and rejected only at submit, with or without an input schema. The input schema guards only
  UNTRUSTED boundaries — storage reload, raw server input, URL params. Omit it, and those
  boundaries parse with the OUTPUT schema, leniently: an invalid stored value falls to the
  default, with the error recorded. That is the right behavior for most fields. Declare
  <code>input</code> yourself for its real jobs: coercion (<code>z.coerce</code>), key
  migration, and restoring INVALID persisted drafts across reload (long text —
  <code>textOf</code> does this for you, and takes an <code>output</code> override for
  formats: <code>textOf(&#123; output: z.string().email('…') &#125;)</code>).
</p>

<h2>The helpers</h2>
<p>
  <code>slider</code>, <code>enumOf</code>, <code>textOf</code>, <code>boolOf</code> build the
  common definitions. Call them anywhere — including inside a per-pass definition function —
  because their SCHEMAS are cached automatically, keyed on the exact values the schemas are
  built from. The inputs are the dependency array: nothing to declare, staleness impossible.
</p>

<pre>{`import { slider, enumOf, textOf, boolOf } from 'form-graph/defs';

slider({ min: 1, max: 50, step: 1, default: 25, presets: [...] })
// meta: { min, max, step, presets? } — presets are meta, outside the schema cache key

enumOf({
  options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }],
  default: 'a',
  gate: { b: cond && 'reason' },   // availability: disabled option + correction, one declaration
})
// value type: 'a' | 'b' — inferred, numeric enums included

textOf({ maxLength: 200, required: true })
boolOf(true)`}</pre>

<h2>Conditional anything</h2>
<p>
  Presets, step, bounds, options, messages — a definition function just computes them. Two
  cache entries exist for the two step values below, built once each:
</p>

<pre>{`.field('steps', (c) => slider({
  min: 1, max: 50,
  step: c.draft ? 4 : 1,
  presets: c.draft ? DRAFT_PRESETS : PRESETS,
}))`}</pre>

<h2>Custom zod, inline</h2>
<p>
  The output schema is yours. Compose over a helper by spreading it and overriding — the base
  schemas stay cached; only your wrapper builds per pass (a few µs):
</p>

<pre>{`.field('hazmatClass', (c) => ({
  ...HAZMAT,
  output: hazmatOutput.refine((v) => !(v === '1.4' && c.service === 'air'), {
    message: 'Class 1.4 explosives cannot ship by air',
  }),
}))`}</pre>

<p>
  This spread IS the way to narrow an output per pass. (The engine also carries a
  <code>FieldOptions.refine</code> hook for hand-written <code>f.field</code> resolvers — if
  you're writing graphs, it's plumbing you never touch.)
</p>

<h2>The performance model, measured</h2>
<ul>
  <li>zod schema construction: ~25–35µs per definition — the one thing worth caching;</li>
  <li>a definition object: ordinary allocation, free;</li>
  <li>
    a full generation-scale graph (LTX): ~20µs per keystroke for resolve + diff — per-pass
    definitions measured FASTER than statically-hoisted ones.
  </li>
</ul>
<p>
  So: use helpers freely, spread-and-override for custom schemas, and if a fully hand-built
  definition is ever hot, memoize its schemas yourself with <code>defFamily(build)</code> —
  the explicit escape hatch you'll likely never need.
</p>

<h2>Registry</h2>
<p>
  <code>graph.defs</code> is the registry: TYPE-complete (every key, function-defined fields
  included), which is what gives <code>typedFields</code>, <code>&lt;Field&gt;</code> and the
  typed React controllers each key's exact value and meta types with no annotations.
</p>
