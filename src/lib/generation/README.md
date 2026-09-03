# The generation corpus

This directory is the ENGINE-LEVEL integration example: `codec()` primitives,
`defineFieldKit` kits, and a hand-written `f.field` resolver in `hub.ts`,
kept as real coverage that the low-level API stays honest underneath the graph
sugar.

It is NOT the way to write a new form. The graph model — `defineGraph`,
`.use`, `branch`, `.effect` — is the authoring surface; see the
docs (/docs) and the demos (`src/routes/demo`). Reach for the patterns in this
directory only when a resolver genuinely can't be expressed as a graph.
