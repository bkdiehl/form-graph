<h1>Codecs</h1>

<p>
  A codec is one field's contract: how raw input becomes a typed value, what the value must
  satisfy on submit, and what the UI needs to render a control for it. Types are inferred from
  the schemas — annotate only when you want a named interface.
</p>

<pre>{`import { z } from 'zod';
import { codec } from 'form-graph';

const PROMPT = codec({
  input: z.string().optional(),                    // lenient: storage, URLs, patches
  output: z.string().min(1, 'Prompt is required'), // strict: validate() / output() / parse()
  default: '',
});`}</pre>

<h2>The five slots</h2>
<ul>
  <li>
    <code>input</code> — the lenient boundary. Runs over anything untrusted: persisted intent,
    URL params, <code>set()</code> patches. Returning <code>undefined</code> means "fall to the
    default" — bad input degrades, it never throws.
  </li>
  <li>
    <code>output</code> — the strict contract. Runs at <code>validate()</code>,
    <code>output()</code> and server <code>parse()</code>. Failures become field errors.
  </li>
  <li><code>default</code> — the value when intent has nothing. A field option can override it per call site.</li>
  <li>
    <code>coerce</code> — optional fast path for TRUSTED writes (the resolver, corrections):
    normalise without paying a schema run. Never used for untrusted input.
  </li>
  <li>
    <code>meta</code> — what the control needs: option lists, min/max, labels. Static here, or
    overridden per call site (see the Fields page).
  </li>
</ul>

<h2>Build once — the codecs slot IS the store</h2>
<p>
  A codec must not be rebuilt inside <code>resolve</code>: schema construction is per-keystroke
  cost there, and it churns every snapshot that references it
  (<code>store.getCodecChurn()</code> reports offenders). But "hoisted" doesn't have to mean a
  named constant — defining each codec <em>inline in the `codecs` slot</em> is the same thing:
  the slot is evaluated once at module load and stored on the form, giving one place per field
  that drives the runtime lookup, the resolver's typing, and the bindings'. Reach for a named
  constant only when a codec is shared across fields or forms. When a codec needs a dynamic
  bound, keep it static and move the dynamic part into the field's
  <code>meta</code>/<code>refine</code> options instead.
</p>

<h2>The primitives</h2>
<pre>{`import { enumCodec, numberCodec, selectCodec, textCodec } from 'form-graph/codecs';

const SIZE = enumCodec({
  options: [
    { value: 'small', label: 'Small' },
    { value: 'large', label: 'Large', disabled: false },
  ],
  default: 'small',
}); // value type: 'small' | 'large' — inferred, including numeric enums

const STEPS = numberCodec({ min: 1, max: 60, step: 1, default: 25 });
// bounded number; out-of-range input snaps to step within [min, max]

const SAMPLER = selectCodec({ options: ['euler', 'ddim'] as const, default: 'euler' });
// closed string set; unknown input projects to the default

const TITLE = textCodec({ maxLength: 200, required: true });`}</pre>

<p>
  The primitives are deliberately domain-free — no presets, no app-specific flags. When your
  domain needs more meta (preset chips, badges), extend locally:
</p>

<pre>{`interface PresetNumberMeta extends NumberMeta {
  presets: { label: string; value: number }[];
}

function presetNumberCodec(opts) {
  const base = numberCodec(opts);
  return { ...base, meta: { ...base.meta, presets: opts.presets } };
}`}</pre>

<h2>Constraint vocabularies</h2>
<p>
  A codec may define a <code>constrain</code> slot: the shape of a per-pass restriction, and
  how that restriction materialises in BOTH its meta and the admitted value. The resolver then
  states a condition once — <code>constrain: &#123; max: 16, reason: 'tier_limit' &#125;</code>
  on a number, <code>constrain: &#123; glacier: tokyo &amp;&amp; 'reason' &#125;</code> on an
  enum — and presentation, correction and note all derive from it. This is how a complex codec
  (a resource picker, an upload slot) exposes domain restrictions without the form restating
  them: the vocabulary lives with the meta it affects.
</p>

<h2>Conditional value sets: codec families</h2>
<p>
  When a field's contract genuinely varies with a condition — per-resolution aspect ratios, a
  per-branch duration range — declare it ONCE as a function of that condition.
  <code>codecFamily</code> memoizes per parameter list, so each variant builds exactly once and
  the churn rule holds without hand-rolled dictionaries of pre-built codecs:
</p>

<pre>{`const AR = codecFamily((res: Resolution) =>
  aspectRatioCodec({ options: RATIOS_BY_RESOLUTION[res], default: '16:9' }));

// in resolve — reads as inline, builds once per distinct res:
aspectRatio: f.field('aspectRatio', AR(resolution))`}</pre>

<p>
  Parameters must be primitives from a finite set (they form the cache key). For a two-variant
  union where per-branch TYPE narrowing matters, two named codecs and a ternary at the field
  also work — each branch's return type then carries its own value union.</p>

<p>
  Know what this choice decides: a stored value outside the narrow variant's set is
  <em>silently projected</em> by the input schema — indistinguishable from garbage input, no
  note, no explanation. That's fine when silence is fine. When the user should see why their
  selection changed, keep ONE wide codec (every value that can legally exist) and express
  availability per pass: <code>meta</code> to disable the option, <code>f.correct</code> to
  substitute with a reason, <code>refine</code> to refuse. Folding availability into the codec
  collapses those three distinct reactions into the silent one.
</p>

<h2>Registry</h2>
<p>
  Declaring codecs on the form (the <code>codecs</code> slot) is what gives
  <code>typedFields</code>, <code>&lt;Field&gt;</code> and the typed React controllers each
  key's exact value and meta types. The slot also accepts field kits directly — their codec is
  unwrapped.
</p>
