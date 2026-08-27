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
      <Controller<number, { min: number; max: number }>
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

<h2>Typed fields</h2>
<p>
  <code>useTypedField(store, name)</code> derives the snapshot's value/meta types from the form's
  codec registry, carried on the store — the hook twin of Svelte's <code>typedFields</code>:
</p>

<pre>{`const steps = useTypedField(store, 'steps');
// FieldSnapshot<number, NumberMeta> | null — inferred, no annotations`}</pre>

<h2>The React ↔ Svelte mapping</h2>
<p>Same concepts, each framework's idiom:</p>
<ul>
  <li><code>useField</code> ↔ <code>field()</code> — one untyped subscription</li>
  <li><code>useTypedField</code> ↔ <code>typedFields(store).key</code> — registry-typed</li>
  <li><code>Controller</code> / <code>createTypedController(form)</code> ↔ <code>&lt;Field&gt;</code> — form-driven visibility with a render callback/snippet</li>
  <li><code>useFormState</code> ↔ <code>formState()</code> — whole-snapshot</li>
</ul>

<h2>Typed controllers</h2>
<p>
  <code>createTypedController</code> derives a Controller from your codec registry, so
  <code>name</code> narrows <code>value</code> and <code>meta</code> with no per-call-site
  generics:
</p>

<pre>{`const codecs = { steps: STEPS, aspectRatio: ASPECT };
const GenController = createTypedController<typeof codecs>();

<GenController name="steps" render={({ value, meta }) => /* number, {min,max} */} />`}</pre>

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
