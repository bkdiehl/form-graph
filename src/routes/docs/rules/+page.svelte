<h1>Rules and reconciliation</h1>

<p>
  Rules rewrite a patch <em>before it reaches intent</em> — the home for couplings between two
  USER choices, where picking one implies the other. They run once per <code>set()</code>, in
  one ordered pass, each rule at most once, no rewind — so cycles are structurally
  unrepresentable rather than detected at runtime.
</p>

<pre>{`import { defineRules } from 'form-graph';

const createPlanCoupling = defineRules<void, PlanRuleState>({
  // optional branch guard: rules only fire when the state matches
  scope: (state) => state.tier === 'enterprise',
  rules: () => ({
    // keyed by the TRIGGER field: fires when 'addon' is in the patch
    addon: (addon, { patch, state }) => {
      if (addon?.id === premiumId && state.plan !== 'annual') {
        return { plan: 'annual' };     // keys to ADD to the patch
      }
    },
  }),
});

const planCoupling = createPlanCoupling();`}</pre>

<h2>Composition</h2>
<p>
  A form's <code>reconcile</code> array lists rule UNITS — <code>defineRules</code> products and
  field kits, each exposing a compiled <code>reconciler</code> — composed left to right over a
  shared patch:
</p>

<pre>{`defineForm({
  codecs,
  resolve,
  reconcile: [planCoupling, checkoutKit],   // units, never bare inline functions
});`}</pre>

<h2>Semantics worth knowing</h2>
<ul>
  <li>
    A rule receives the patch VALUE of its trigger key, plus the pre-patch <code>state</code>
    and the accumulated <code>patch</code>. It returns keys to merge in, or nothing.
  </li>
  <li>
    Keys a rule adds do NOT re-trigger other rules — one pass, in array order. If B must react
    to what A adds, order A's unit before B's and key B's rule on what A writes… or reconsider:
    a chain that deep usually belongs in the resolver.
  </li>
  <li>
    The rewritten patch becomes intent: the coupling is remembered as if the user chose it.
    That is the defining difference from <code>f.correct</code>, which never touches intent —
    see "When the system disagrees" on the Concepts page for the full decision table.
  </li>
</ul>
