import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineGraph } from '../graph.js';
import { boolOf, enumOf, slider, textOf } from '../def-helpers.js';

/**
 * A helper's def must carry its CONCRETE schema type, not erase it to
 * SchemaLike — the docs' spread-and-refine pattern depends on it:
 *
 *   { ...base, output: base.output.refine(...) }
 *
 * This regressed when codec() (whose O generic preserved the type) was
 * deleted; FieldDef's third generic now carries the same information. Found
 * porting civitai's generation graphs, where every family narrows a helper's
 * output per pass.
 */

describe('helper defs carry concrete output schema types', () => {
  it('spread-and-refine compiles on textOf with NO cast', () => {
    const base = textOf();
    const narrowed = {
      ...base,
      output: base.output.refine((v) => v.trim().length > 0, { message: 'Required' }),
    };
    const graph = defineGraph().field('prompt', narrowed);
    const result = graph.parse({ prompt: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.prompt?.message).toBe('Required');
  });

  it('every helper output is refinable — through a real graph', () => {
    // .refine compiling on each helper's output IS the assertion; the graphs
    // prove the refined schema actually rejects at submit.
    const graph = defineGraph()
      .field('steps', {
        ...slider({ min: 1, max: 10, default: 5 }),
        output: slider({ min: 1, max: 10 }).output.refine((v) => v !== 5, { message: 'not 5' }),
      })
      .field('kind', {
        ...enumOf({
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
          default: 'a',
        }),
        output: enumOf({
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
          default: 'a',
        }).output.refine((v) => v !== 'b', { message: 'not b' }),
      })
      .field('flag', {
        ...boolOf(),
        output: boolOf().output.refine((v) => v, { message: 'must be true' }),
      });
    const result = graph.parse({ steps: 5, kind: 'b', flag: false });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.errors).sort()).toEqual(['flag', 'kind', 'steps']);
    }
  });

  it('the textOf output override keeps ITS schema type too', () => {
    const email = textOf({ output: z.string().email('bad email') });
    // ZodString survives the overload: .max is a ZodString method
    const capped = { ...email, output: email.output.max(100) };
    const graph = defineGraph().field('email', capped);
    expect(graph.parse({ email: 'not-an-email' }).success).toBe(false);
  });
});
