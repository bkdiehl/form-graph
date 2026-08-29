<h1>Reusable definitions</h1>

<p>
  There is no reuse machinery — definitions and graphs are ordinary values, so reuse is
  ordinary code. Three patterns cover everything the demos and the generation-scale ports
  needed:
</p>

<h2>1. Definition factories</h2>
<p>A function returning a definition, parameterized by whatever varies:</p>

<pre>{`const toppingsDef = (budget: number) => ({
  input: z.array(z.string()).optional(),
  output: z.array(z.string()),
  default: [] as string[],
  meta: { budget },
  correct: (picked: string[]) => trimToBudget(picked, budget),
});

.field('toppings', (ctx) => toppingsDef(SIZES[ctx.size].budget))`}</pre>

<p>
  Helpers used inside a factory keep their automatic schema caching; a factory that hand-builds
  zod pays construction per distinct call — wrap the schema part in
  <code>codecFamily</code> if it's ever hot.
</p>

<h2>2. Sections: Graph → Graph functions</h2>
<p>
  A section appends its fields to whatever chain it's given and hands the chain back — ctx
  flows through, so cross-section conditions are plain reads:
</p>

<pre>{`export const withContact = <C extends object, D extends Record<string, AnyFieldDef>>(
  g: Graph<C, void, D>
) =>
  g
    .field('email', EMAIL)
    .field('isBusiness', boolOf())
    .field('company', (ctx) => (ctx.isBusiness ? COMPANY : null));

// later, another section reads what contact declared:
export const withPayment = (g) =>
  g.field('paymentMethod', (ctx) => enumOf({
    options: METHODS,
    default: 'card',
    gate: { invoice: !ctx.isBusiness && 'invoice_requires_business' },
  }));`}</pre>

<h2>3. The same section, mounted more than once</h2>
<p>
  Field keys are unique form-wide, so a re-mountable section takes a key PREFIX — and an
  optional <code>when</code> makes the whole mount conditional (keys go optional):
</p>

<pre>{`withAddress(g, 'shipping');                                    // required keys
withAddress(g, 'billing', (ctx) => !ctx.billingSameAsShipping); // optional keys`}</pre>

<p>
  The checkout demo composes all three patterns into one chain; the LTX/Wan generation ports
  compose shared prefixes and suffixes across five version graphs. Effects that belong to a
  section attach with <code>.effect(unit)</code> and ride into the form's
  <code>reconcile</code> via <code>graph.effects</code>.
</p>
