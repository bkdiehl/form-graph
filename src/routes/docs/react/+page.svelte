<h1>React binding</h1>

<p>
  <code>form-graph/react</code> wraps the store in <code>useSyncExternalStore</code>. Same contract
  as the Svelte binding: per-field subscriptions, reference-equality bailout, <code>null</code>
  while a field is inactive in the current branch.
</p>

<pre>{`import { useForm, useField, FormProvider, Controller } from 'form-graph/react';
import { form } from './my-form';

function GenerationForm({ ext }) {
  const store = useForm(form, { ext });

  return (
    <FormProvider store={store}>
      <PromptInput />
      <Controller
        graph={form}
        name="steps"
        render={({ value, meta, error, onChange }) => (
          <Slider min={meta.min} max={meta.max} value={value} onChange={onChange} />
        )}
      />
    </FormProvider>
  );
}

function PromptInput() {
  const store = useFormStore();
  const field = useField<string>(store, 'prompt');
  if (!field) return null;
  return (
    <input value={field.value} onChange={(e) => store.set({ prompt: e.target.value })} />
  );
}`}</pre>

<p>
  The render props are <code>value</code>, <code>meta</code>, <code>error</code>,
  <code>onChange</code>, <code>isComputed</code>, and <code>note</code> — the resolution note
  set when a <code>correct</code> rule replaced the value this pass, for rendering a "we
  adjusted this" hint inline.
</p>

<h2>Typed fields</h2>
<p>
  <code>useTypedField(store, name)</code> derives the snapshot's value/meta types from the form's
  def registry, carried on the store — the hook twin of Svelte's <code>typedFields</code>:
</p>

<pre>{`const steps = useTypedField(store, 'steps');
// FieldSnapshot<number, SliderDefMeta> | null — inferred, no annotations`}</pre>

<h2>The React ↔ Svelte mapping</h2>
<p>Same concepts, each framework's idiom:</p>
<ul>
  <li><code>useField</code> ↔ <code>field()</code> — one untyped subscription</li>
  <li><code>useTypedField</code> ↔ <code>typedFields(store).key</code> — registry-typed</li>
  <li><code>Controller</code> / <code>createTypedController(form)</code> ↔ <code>&lt;Field&gt;</code> — form-driven visibility with a render callback/snippet</li>
  <li><code>useFormState</code> ↔ <code>formState()</code> — whole-snapshot</li>
</ul>

<h2>Typed controllers: the <code>graph</code> prop</h2>
<p>
  Pass the graph (type-only — the store still comes from context or the <code>store</code>
  prop) and <code>name</code> is constrained to the graph's keys: registry fields AND state
  keys (computeds, branch tags), with <code>value</code>/<code>meta</code> narrowed per key. A
  state-only key types <code>meta</code> as <code>undefined</code> and its value as optional
  across branch arms.
</p>

<pre>{`<Controller graph={generationHub} name="steps"
  render={({ value, meta }) => /* number, { min, max } */} />
<Controller graph={videoHub} name="wanVersion"   // a branch TAG — state key
  render={({ value }) => /* 'v2.1' | 'v2.2' | ... | undefined */} />`}</pre>

<p>
  <code>createTypedController&lt;typeof defs&gt;()</code> remains for registry-only typing, and
  the bare generic form (<code>Controller&lt;number, Meta&gt;</code>) as the escape hatch.
</p>

<h2>onChange accepts the field's INPUT type</h2>
<p>
  With the <code>graph</code> prop, <code>onChange</code> is typed
  <code>(next: Value | In) =&gt; void</code>, where <code>In</code> is inferred from the
  def's <em>input schema</em> — a picker can hand back a bare
  <code>&#123; id &#125;</code> or a number and it typechecks, because that is what the
  schema declares it accepts and normalizes. This only works for defs that keep their
  concrete schema types (<code>satisfies FieldDef&lt;…&gt;</code>, never a return
  annotation — see Definitions); an annotated def falls back to
  <code>In = Value</code>, i.e. parsed-shaped writes only.
</p>

<h2>MultiController</h2>
<p>
  One subscription over SEVERAL fields — for widgets that read a group (an alerts panel over
  <code>model</code> + <code>resources</code> + <code>vae</code>). Re-renders when any named
  field's snapshot reference changes:
</p>

<pre>{`<MultiController
  graph={imageHub}
  names={['model', 'resources', 'vae']}
  render={({ values }) => <ResourceAlerts {...values} />}
/>`}</pre>

<h2>Lists: <code>useList</code> and <code>&lt;ListElement&gt;</code></h2>
<pre>{`function Runs() {
  const runs = useList('runs');            // context store; or useList('runs', store)
  if (!runs) return null;                  // list inactive in this branch
  return (
    <>
      {runs.ids.map((id) => <Row key={id} id={id} />)}
      <button onClick={() => runs.add()}>Add</button>
    </>
  );
}

const Row = memo(function Row({ id }: { id: string }) {
  return (
    <ListElement list="runs" id={id}>
      {/* bare member names — the element path prefixes them */}
      <Controller name="engine" render={...} />
      <Controller name="epochs" render={...} />
    </ListElement>
  );
});`}</pre>
<p>
  <code>useList</code> subscribes to the MEMBERSHIP entry only: add/remove/reorder re-render the
  shell, an element edit never does. Inside <code>&lt;ListElement&gt;</code>, every existing
  hook and control works unchanged with bare member names — <code>useField</code>,
  <code>Controller</code> (reads AND writes), <code>MultiController</code>, nested
  <code>useList</code> — each subscribing to its own element, so a <code>memo</code>'d row
  bails on everything but its own data. That is the render-isolation contract (see
  Collections), pinned by a render-count test. The ops mirror
  <code>store.list()</code>'s, with one difference: a click landing after a branch switch
  deactivated the list returns <code>&#123; success: false, reason: 'inactive' &#125;</code>
  instead of throwing.
</p>
<p>
  <code>useList</code> is context-first (<code>useList(key, store?)</code>) like
  <code>Controller</code>; <code>useField(store, name)</code> predates the provider and stays
  store-first. Element fields are shape-typed (the registry covers root fields only — see
  Collections' limits).
</p>

<h2>Focus on error</h2>
<pre>{`const result = store.validate(step.keys);
if (!result.success) focusFirstError(store, step.keys);`}</pre>
<p>
  The render props carry <code>fieldProps</code> — spread it onto the control's focusable
  element (<code>&lt;input &#123;...fieldProps&#125; /&gt;</code>; explicit by design, since not
  every render prop targets an element) and <code>focusFirstError(store, keys?)</code> jumps
  to the FIRST errored field in declaration order, scoped to a step's keys when given (a list
  key covers its elements). Works unchanged inside <code>&lt;ListElement&gt;</code> — the
  attribute carries the full element path. SSR-safe, never throws. A <code>useField</code>-based
  control opts in by rendering <code>data-fg-field=&#123;name&#125;</code> itself — the attribute
  is the whole contract.
</p>

<h2>Notes</h2>
<ul>
  <li>
    <code>useForm</code> creates the store once and pushes <code>ext</code> in only when it deeply
    changed — pass a fresh object literal every render without churn.
  </li>
  <li>
    The context value is the store handle, which never changes identity — providers never re-render
    their subtree; only leaf subscriptions fire.
  </li>
</ul>
