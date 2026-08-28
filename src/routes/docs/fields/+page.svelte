<h1>The resolver's Fields API</h1>

<p>
  <code>resolve(f, ext)</code> receives a <code>Fields</code> collector. Every field the current
  branch has is <em>declared by calling</em> <code>f.field</code> — presence in the return value
  is what makes a field exist, so a <code>switch</code> arm that skips a call removes that field
  from the branch, its snapshot, and the UI.
</p>

<pre>{`resolve: (f: Fields, ext: Ext) => {
  const mode = f.field('mode', MODE);
  const base = { mode, prompt: f.field('prompt', PROMPT) };

  switch (mode) {
    case 'upscale':
      return { ...base, scale: f.field('scale', SCALE) };
    default:
      return { ...base, steps: f.field('steps', STEPS) };
  }
}`}</pre>

<h2>Dependencies are variables</h2>
<p>
  A field that depends on another field references its VALUE — and since values are variables,
  the language enforces what v1's graph builder enforced with types: you can only reference a
  field declared above you, it cannot be misspelled, and it arrives typed. Declaration order is
  dependency order, visibly.
</p>

<pre>{`resolve: (f) => {
  const region = f.field('region');            // declared -> in scope
  return {
    region,
    storageClass: f.field('storageClass', {
      // can ONLY reference prior fields; typed from region's codec
      constrain: { glacier: region === 'ap-northeast-1' && 'unavailable' },
    }),
  };
}`}</pre>

<h2>f.field(key, codec?, options?)</h2>
<p>
  When the key is declared in the form's <code>codecs</code> slot, the codec argument can be
  omitted — the registry supplies it, and inline resolvers get per-key typing automatically. A
  standalone fragment opts in by typing its parameter with its own codec record:
</p>

<pre>{`// inline resolvers are typed automatically; standalone fragments use
// defineSection — an identity helper whose only job is this inference:
const section = defineSection({
  codecs: { bucket: BUCKET, region: REGION },
  resolve: (f) => ({
    bucket: f.field('bucket'),                 // codec from the registry, typed string
    region: f.field('region', { scope: 'x' }), // options in the second position
  }),
});`}</pre>

<p>
  Passing the codec explicitly always works — required for keys outside the registry, and for a
  codec built with call-site config. An unregistered key with no codec throws at resolve time,
  naming the key.
</p>

<ul>
  <li>
    <code>scope</code> — where this field's memory lives. Scope values are computed by the
    resolver and become part of the intent address (<code>steps&#64;groupA</code>), so the same
    key remembers a value per group. See Storage for how this looks on disk.
  </li>
  <li>
    <code>default</code> — call-site override of the codec default; a function form defers
    computation (<code>default: () =&gt; expensive()</code>).
  </li>
  <li>
    <code>meta</code> — per-pass presentation, merged over the codec's contribution. The rule
    that keeps every fact single-homed: the codec declares only the UNCONDITIONAL props (its
    meta is a partial — omit what varies); a fully conditional prop is stated once here, with
    both arms (<code>meta: &#123; placeholder: business ? 'billing&#64;…' : 'you&#64;…'
    &#125;</code>); a default-with-exception patches only the exception
    (<code>meta: business ? &#123; maxLength: 500 &#125; : &#123;&#125;</code> — empty else, the
    codec value survives). The FUNCTION form takes full control (resolved value +
    <code>base</code>; its return replaces).
  </li>
  <li>
    <code>constrain</code> — a per-pass restriction stated ONCE, in the codec's own constraint
    vocabulary (each codec defines what it accepts via its <code>constrain</code> slot). The
    codec derives both halves: the presentation in its meta, and the admitted value — a moved
    value is recorded as a correction with the codec-returned reason. enumCodec/selectCodec
    take per-option exclusions (<code>constrain: &#123; glacier: tokyo &amp;&amp; 'reason'
    &#125;</code> → disabled option + substitution); numberCodec takes bounds
    (<code>constrain: &#123; max: 16, reason: 'tier_limit' &#125;</code> → tightened slider +
    clamp). A custom codec ships its own vocabulary the same way. Reach for raw
    <code>meta</code>/<code>f.correct</code> only when the reaction isn't what the codec's
    vocabulary expresses.
  </li>
  <li>
    <code>refine</code> / <code>refineDeps</code> — narrow the output contract under this pass's
    conditions, in zod's own vocabulary. Deps-cached like a React hook: the schema is rebuilt
    only when <code>refineDeps</code> change, so keep deps primitive and stable.
  </li>
</ul>

<pre>{`const service = f.field('service', SERVICE, { meta: { options: available } });

f.field('hazmatClass', HAZMAT, {
  refine: (s) =>
    s.refine((v) => !(v === '1.4' && service === 'air'), {
      message: 'Class 1.4 explosives cannot ship by air',
      params: { kind: 'hazmat_air_forbidden' },
    }),
  refineDeps: [service],
});`}</pre>

<h2>f.correct(key, value, reason, detail?)</h2>
<p>
  An imperative correction: replaces the resolved value, re-derives the meta, records a note —
  and leaves intent untouched, so the user's original choice returns when conditions do. Call it
  immediately after the field it corrects. For when the SYSTEM invalidated a choice; see
  "When the system disagrees" on the Concepts page for how it differs from
  <code>reconcile</code> and <code>refine</code>.
</p>

<pre>{`let crust = f.field('crust', CRUST, { scope: size, meta: { options } });
if (!options.includes(crust)) {
  crust = f.correct('crust', options[0], 'not_available_for_size', { size });
}`}</pre>

<h2>f.computed(key, value)</h2>
<p>
  A derived, read-only key: it appears in state and snapshots (marked
  <code>isComputed</code>), participates in the diff, but accepts no input and stores no intent.
  Prices, ceilings, derived totals.
</p>

<pre>{`const dimKg = Math.round((l * w * h) / 5000);
return { ...base, dimKg: f.computed('dimKg', dimKg) };`}</pre>

<h2>f.note(note)</h2>
<p>
  A free-form resolution note for anything worth surfacing that isn't a correction.
  <code>f.correct</code> writes its own note; reach for <code>f.note</code> directly only for
  advisory messages.
</p>

<h2>Rules of the collector</h2>
<ul>
  <li>Each key at most once per pass — a duplicate declaration throws.</li>
  <li>
    Field keys cannot contain <code>&#64;</code> <code>/</code> <code>[</code> <code>]</code>
    <code>%</code> — reserved by the intent-address grammar.
  </li>
  <li>
    Order is data flow: a field whose options depend on another field's value must be declared
    after it. The resolver is a plain function — there is no dependency graph to get wrong,
    only reading a variable before it exists.
  </li>
</ul>
