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

<h2>Keep the schema type: <code>satisfies</code>, never a type annotation</h2>
<p>
  The helpers return their CONCRETE schema types (<code>textOf().output</code> is a
  <code>ZodString</code>, not a bare <code>SchemaLike</code>), so the spread-and-narrow
  pattern above composes without casts. Hand-written definitions keep that property only if
  you let inference carry the type — annotating erases it:
</p>

<pre>{`const GOOD = { output: z.string().email(), default: '' } satisfies FieldDef<string>;
GOOD.output.refine(...)   // ZodString survives

const BAD: FieldDef<string> = { output: z.string().email(), default: '' };
BAD.output.refine(...)    // error: SchemaLike<string> has no .refine`}</pre>

<p>
  <code>defineDef(&#123;...&#125;)</code> packages the same rule as a helper: an identity
  wrapper that infers <code>T</code> from the definition&#39;s own <code>output</code> schema
  and validates <code>default</code>/<code>correct</code>/<code>meta</code> against it, while
  preserving every concrete schema type — use it for def-factory returns, where a return-type
  annotation is the tempting (and silently erasing) form. One difference from
  <code>satisfies</code>: callback params get no contextual type, so annotate them; a wrong
  annotation is still rejected.
</p>

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
  So: use helpers freely, spread-and-override for custom schemas — and give an app's OWN def
  factories the same treatment the built-ins get with <code>cachedFactory</code>:
</p>

<pre>{`import { cachedFactory } from 'form-graph';

// Built once per distinct config, reused on every later pass.
export const durationDef = cachedFactory((cfg: { min: number; max: number }) => ({
  input: z.coerce.number().optional(),
  output: z.number().min(cfg.min).max(cfg.max),
  default: cfg.min,
  meta: cfg,
}));`}</pre>

<p>
  The config is the cache key (JSON), so it must be function-free; a <code>keyOf</code> second
  argument narrows the key when parts of the config don't shape the schemas. For a schema built
  from LIVE ctx (a gate set, a discriminant) use <code>defFamily(build)</code> instead and key
  on exactly the values the schema reads — that dependency is something only the author knows.
  A factory that builds schemas inline on every pass is what the store's codec-churn warning
  points at; it compares SCHEMA identity (input AND output) across passes, so cached factories
  and hoisted defs pass clean while genuine per-pass construction is named.
</p>

<p>
  <strong>Never cache a schema that closes over per-request state.</strong> A transform that
  captures, say, a request-scoped collector from ext and gets cached will keep writing into the
  FIRST request's collector forever. Cache only what the config determines; take per-request
  effects through <code>correct</code> on the (uncached, cheap) def object instead.
</p>

<h2>Per-pass narrowing: refine</h2>
<p>
  When only the STRICTNESS of a field varies per pass — required unless images are attached, a
  ceiling that depends on a sibling — don't rebuild <code>output</code>; keep the cached base
  and narrow it with <code>refine</code>, which builds one small wrapper per pass:
</p>
<pre>{`.field('prompt', ({ images }) => ({
  ...PROMPT, // cached/hoisted base def
  refine: images?.length ? undefined : (output) => output.min(1, 'Prompt is required'),
}))`}</pre>
<p>
  A failing refine keeps the value in place with a live <code>error</code> on the snapshot and
  fails submit/parse — refusal for the user to resolve, where <code>correct</code> is
  substitution the form resolves itself.
</p>

<h2>Registry</h2>
<p>
  <code>graph.defs</code> is the registry: TYPE-complete (every key, function-defined fields
  included), which is what gives <code>typedFields</code>, <code>&lt;Field&gt;</code> and the
  typed React controllers each key's exact value and meta types with no annotations.
</p>
