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
  <code>defFamily</code> if it's ever hot.
</p>

<h2>2. Sections are just graphs, mounted with <code>.use()</code></h2>
<p>
  There is no section concept to learn: a reusable section IS a <code>defineGraph</code>. If
  it needs facts from wherever it gets mounted, it declares them as its <code>Ext</code> — at
  the mount point, the parent's ext with the ctx-so-far merged over it is what the child
  receives, so a need is satisfied by a prior field or by the parent's own ext. Its fields,
  registry, and effects join the chain.
</p>

<pre>{`export const contact = defineGraph()
  .field('email', EMAIL)
  .field('isBusiness', boolOf())
  .field('company', (ctx) => (ctx.isBusiness ? COMPANY : null))
  .effect(contactRules);   // the section's own coupling rides the mount

// another graph NEEDS what contact declares — that's its Ext:
export const payment = defineGraph<{ isBusiness: boolean }>()
  .field('paymentMethod', (_ctx, ext) => enumOf({
    options: METHODS,
    default: 'card',
    gate: { invoice: !ext.isBusiness && 'invoice_requires_business' },
  }));

// mounting is chain-linear; payment's need is met by contact's field:
const graph = defineGraph()
  .use(contact)
  .field('billingSameAsShipping', boolOf(true))
  .use(payment);`}</pre>

<p>
  A missing REQUIRED need is a type error at the mount point naming the key; optional needs
  read as <code>undefined</code> when nothing upstream declares them. Hubs mount the same way
  — <code>.use()</code> accepts anything graph-shaped.
</p>

<h2>3. The same section, mounted more than once</h2>
<p>
  Field keys are unique form-wide, so mounting one section twice needs a key PREFIX — a
  transform a standalone graph can't express. For that, <code>.use()</code> also takes a plain
  function (<code>use(fn)</code> is <code>fn(g)</code>), and an optional <code>when</code>
  makes the whole mount conditional (keys go optional):
</p>

<pre>{`g.use((g) => withAddress(g, 'shipping'));                       // required keys
g.use((g) => withAddress(g, 'billing', (ctx) => !ctx.billingSameAsShipping));`}</pre>

<p>
  The checkout demo composes all three patterns into one chain; the LTX/Wan generation ports
  compose shared prefixes and suffixes across five version graphs. Effects that belong to a
  section attach with <code>.effect(unit)</code> and ride into the form's
  <code>reconcile</code> via <code>graph.effects</code>.
</p>
