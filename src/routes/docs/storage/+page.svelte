<h1>Storage</h1>

<p>
  The store persists INTENT — the user's raw choices, scoped addresses included — not resolved
  state. Reload, and the same resolver over the same intent reproduces the same form, including
  memory for branches that aren't currently active.
</p>

<h2>persistedStorage</h2>
<pre>{`import { persistedStorage } from 'form-graph';

const storage = persistedStorage('my-app:quote');                  // localStorage
const tabScoped = persistedStorage('my-app:draft', { session: true }); // sessionStorage
const slower = persistedStorage('my-app:big', { delayMs: 1000 });  // debounce (default 300ms)

const store = form.createStore({ storage });`}</pre>
<ul>
  <li>Writes are debounced; <code>pagehide</code> and tab-hide flush pending writes.</li>
  <li>SSR-safe: with no <code>window</code> it returns <code>undefined</code> — and <code>createStore</code> accepts <code>storage: undefined</code>, so one line works on both sides.</li>
  <li>Load/save failures (quota, privacy mode, bad JSON) degrade to defaults; they never throw into the form.</li>
  <li><code>dispose()</code> flushes and detaches the listeners.</li>
</ul>

<h2>The adapter contract</h2>
<p>Anything with these two methods is a storage backend — a server draft API, an in-memory test double:</p>
<pre>{`interface StorageAdapter {
  load(): Record<string, unknown> | undefined;   // address -> raw value
  save(intent: Record<string, unknown>): void;
}

// wrap any adapter with debouncing:
import { debouncedStorage } from 'form-graph';
const adapter = debouncedStorage(myServerAdapter, 500);`}</pre>

<h2>What the record looks like</h2>
<pre>{`{
  "region": "eu-west",
  "instanceType@gpu": "gpu.a100",     // scoped: remembered per preset
  "instanceType@compute": "c2.xlarge",
  "vcpus@gpu": 32
}`}</pre>
<p>
  Addresses are <code>key&#64;scope</code> (scope parts joined with <code>/</code>, separators
  escaped). Treat them as opaque keys — <code>[</code> and <code>]</code> are reserved for
  future per-item addressing.
</p>

<h2>Graph-level scope — it NESTS</h2>
<p>
  A field opts into scoped memory with <code>scope</code> on its definition. When a whole
  SECTION of the form should bucket the same way, declare it once at construction — and
  scope composes down the mount tree: a parent's segments prefix everything a mounted
  child (or branch member) declares, so scope really does apply to everything below it.
</p>

<pre>{`const family = defineGraph<FamilyExt>({ scope: (ext) => ext.ecosystem })
  .field('steps', STEPS)               // -> steps@SDXL, steps@Flux, ...
  .field('cfg', ({ model }) => ({ ...CFG, scope: [model.id] })) // APPENDS: cfg@SDXL/123
  .field('seed', { ...SEED, scope: rootScope() })   // ESCAPE HATCH: bare, global
  .use(defineGraph({ scope: () => 'textFields' })   // nests: fields at @SDXL/textFields
    .field('prompt', PROMPT));`}</pre>

<ul>
  <li>The fn runs at resolve time with the graph's ext (a mounted child sees the parent's ctx merged in), so the bucket follows the live discriminant.</li>
  <li>Fields INHERIT the accumulated path; a field-level plain <code>scope</code> appends to it (<code>[]</code> appends nothing).</li>
  <li><code>rootScope(...parts)</code> is the escape hatch — absolute from the root regardless of ancestry; <code>rootScope()</code> means the bare key (global memory).</li>
  <li>Returning <code>undefined</code> from the graph fn contributes nothing — fields stay at the inherited path.</li>
</ul>

<h2>Reading a record from outside</h2>
<p>
  External readers (a "restore last session?" banner, migration scripts) go through the intent
  readers instead of parsing addresses by hand:
</p>
<pre>{`import { readIntentValue, readIntentBuckets } from 'form-graph';

readIntentValue(stored, 'instanceType', 'gpu');  // scoped bucket, bare-key fallback
readIntentBuckets(stored, 'instanceType');       // { gpu: ..., compute: ... }`}</pre>

<h2>Seeding a record from outside</h2>
<p>
  The persisted format is one flat object of <code>address → raw value</code>, so a migration
  from another storage system can build a record and write it under the store's key before the
  first mount. <code>scopedAddress</code> is the write-side counterpart of the readers — it
  applies the same escaping the store uses, so never glue <code>key + '@' + part</code> by hand:
</p>
<pre>{`import { scopedAddress } from 'form-graph';

const record = {
  prompt: old.prompt,                                   // bare key: global memory
  [scopedAddress('steps', 'SDXL')]: old.sdxlSteps,      // 'steps@SDXL'
};
localStorage.setItem('my-form', JSON.stringify(record));`}</pre>
<p>
  Values are copied raw: the boundary input schemas validate them on first resolve, so a stale
  or malformed value degrades to the field's default instead of corrupting the store.
</p>
