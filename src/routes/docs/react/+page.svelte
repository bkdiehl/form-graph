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
