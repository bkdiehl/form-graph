import type { ValidationResult } from './types.js';

/**
 * Parse-time fixed point for MUTUALLY DEPENDENT fields.
 *
 * A graph resolves once, in declaration order — that is what makes cycles
 * unrepresentable and dependencies visible. But occasionally two fields
 * genuinely depend on each other (civitai's Wan 2.1: `ecosystem` needs
 * `resolution`, which is declared after it). A data-graph-style engine hides
 * that by iterating its whole graph to a fixed point; here the iteration is
 * EXPLICIT, bounded, and at the call site:
 *
 *   const result = parseFixpoint(videoHub, raw, ctx, (state) =>
 *     state.resolution !== undefined ? { resolvedResolution: state.resolution } : null
 *   );
 *
 * Each pass feeds values from the previous pass's resolved state back through
 * ext (declare the feedback keys on the graph's Ext), and the loop returns as
 * soon as a pass changes nothing. Non-convergence THROWS: an oscillating
 * feedback loop is a design bug in the caller's graph, not an input condition,
 * and returning a wobbling result would hide it.
 *
 * The interactive half of the same coupling is a RULE: on the client, a
 * set()-time rule retargets the dependent field the moment the user edits its
 * driver. Ship both — the rule for stores, the fixpoint for parse.
 *
 * Comparison is by JSON serialisation of the result, so this is for
 * JSON-safe data (which parsed form data is by construction).
 */
export function parseFixpoint<State, Ext extends object>(
  definition: { parse(raw: Record<string, unknown>, ext: Ext): ValidationResult<State, State> },
  raw: Record<string, unknown>,
  ext: Ext,
  feedback: (state: State) => Partial<Ext> | null,
  { maxPasses = 4 }: { maxPasses?: number } = {}
): ValidationResult<State, State> {
  let result = definition.parse(raw, ext);
  let previous = JSON.stringify(result.success ? result.data : result.errors);

  for (let pass = 0; pass < maxPasses; pass++) {
    if (!result.success) return result;
    const fed = feedback(result.state);
    if (fed === null) return result;
    const next = definition.parse(raw, { ...ext, ...fed });
    const serialized = JSON.stringify(next.success ? next.data : next.errors);
    if (serialized === previous) return next;
    result = next;
    previous = serialized;
  }

  throw new Error(
    `parseFixpoint: no convergence within ${maxPasses} passes — the feedback loop oscillates. ` +
      `This is a graph-design bug (two fields correcting each other to different values), not an input condition.`
  );
}
