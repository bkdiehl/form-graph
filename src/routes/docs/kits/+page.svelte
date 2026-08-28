<h1>Field kits</h1>

<p>
  A field kit packages one complex field's whole anatomy — key, codec, per-pass options, its
  correction policy, and the patch rules that must travel with it — so every complex field in an
  app has the same shape instead of each one hand-rolling helpers. Simple fields don't need
  kits; reach for one when a field carries config, rules, or corrections.
</p>

<pre>{`import { defineFieldKit } from 'form-graph';

const createPlanKit = defineFieldKit<PlanConfig, PlanArgs, PlanValue, PlanMeta>({
  key: 'plan',

  // static, or derived once from config — never rebuilt per pass
  codec: (config) => planCodec(config.catalog),

  // per-pass field options from bound config + the resolver's args
  options: (config, args) => ({
    meta: { options: config.catalog.filter((p) => p.tier <= args.tier) },
  }),

  // per-pass correction, applied via f.correct with the returned reason
  correct: (value, config, args) =>
    value && !config.catalog.some((p) => p.id === value.id)
      ? { value: config.catalog[0], reason: 'plan_retired' }
      : undefined,

  // patch rules owned by this field — same record shape as defineRules
  rules: (config) => ({
    plan: (plan, { state }) =>
      plan?.id === config.premiumId && state.billing !== 'annual'
        ? { billing: 'annual' }
        : undefined,
  }),
});`}</pre>

<h2>Two stages: spec, then instance</h2>
<pre>{`// bind app config ONCE per module — catalogs, tables, injected functions
const plan = createPlanKit({ catalog, premiumId });

// in the resolver: args are the values THIS PASS computed
const value = plan.field(f, { tier: ext.user.tier });

// on the form: the kit's rules ride its reconciler; its codec registers by key
defineForm({
  codecs: { plan },                 // kits are accepted directly — codec unwrapped
  resolve,
  reconcile: [plan],
});`}</pre>

<h2>What the factory enforces (not just documents)</h2>
<ul>
  <li>
    The codec resolves ONCE, at kit creation — a config-parameterised codec cannot be rebuilt
    per pass, so the no-churn rule holds structurally.
  </li>
  <li>The field key is declared, not buried in a helper body.</li>
  <li>
    <code>reconciler</code> is always present (identity when the spec has no rules), so
    <code>reconcile</code> arrays compose uniformly.
  </li>
</ul>

<h2>Config vs Args</h2>
<p>
  <code>Config</code> is what the APP binds once per kit instance: catalogs, version tables,
  injected compatibility functions — how a kit stays library-generic while the app stays
  concrete. <code>Args</code> is what the RESOLVER passes on every pass: values it just
  computed, per-pass toggles. Use <code>void</code> when nothing is dynamic.
</p>
