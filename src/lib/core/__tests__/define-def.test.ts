import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { defineDef } from '../def-helpers.js';
import { defineGraph, type DefInputValue } from '../graph.js';

/**
 * `defineDef` exists so def factories never annotate their return type — an
 * annotation widens `input` to SchemaLike<unknown> and silently erases the
 * typed write path. The helper must (a) keep the concrete object type, and
 * (b) check the def's internal consistency against its own output schema,
 * like `satisfies FieldDef<T, M>` does.
 */

describe('defineDef', () => {
  it('preserves the concrete input schema type (DefInputValue survives)', () => {
    const def = defineDef({
      input: z.number().or(z.string()).transform(Number).optional(),
      output: z.number(),
      default: 5,
    });
    // The write path accepts the input schema's raw side, not just `number`
    expectTypeOf<DefInputValue<typeof def>>().toEqualTypeOf<string | number | undefined>();
    const graph = defineGraph().field('n', def);
    const result = graph.parse({ n: '7' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.n).toBe(7);
  });

  it('checks default/correct/meta against the output schema type', () => {
    // Callback params get no contextual type through the inference target
    // (unlike `satisfies`) — annotate them; the check verifies the annotation
    defineDef({
      output: z.enum(['a', 'b']),
      default: 'a',
      correct: (value: 'a' | 'b') => (value === 'a' ? undefined : { value: 'a' as const, reason: 'pin' }),
      meta: (value: 'a' | 'b') => ({ current: value }),
    });

    defineDef({
      output: z.enum(['a', 'b']),
      // @ts-expect-error correct's param must match the output schema's type
      correct: (value: number) => undefined,
    });

    defineDef({
      output: z.number(),
      // @ts-expect-error default must match the output schema's type
      default: 'not a number',
    });

    defineDef({
      output: z.string(),
      // @ts-expect-error correct must return the output schema's type
      correct: () => ({ value: 42, reason: 'nope' }),
    });
  });

  it('is a runtime identity', () => {
    const raw = { output: z.boolean(), default: true };
    expect(defineDef(raw)).toBe(raw);
  });
});
