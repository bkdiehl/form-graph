import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { codec, defineForm, type Fields, type StandardSchemaV1 } from '../index.js';
import { runSchema } from '../run-schema.js';

/**
 * The core accepts Standard Schema (~standard.validate) alongside the
 * structural parse/safeParse contract — decided Q9a in the rethink doc. Sync
 * only; zod keeps its native safeParse path since it implements both.
 */

/** A hand-written Standard Schema — what valibot/arktype would hand us. */
function standardNumber(min: number): StandardSchemaV1<number> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) =>
        typeof value === 'number' && value >= min
          ? { value }
          : { issues: [{ message: `Expected a number >= ${min}` }] },
    },
  };
}

const asyncSchema: StandardSchemaV1<number> = {
  '~standard': {
    version: 1,
    vendor: 'async-test',
    validate: async (value) => ({ value: value as number }),
  },
};

describe('runSchema', () => {
  it('runs a standard schema and maps its result shapes', () => {
    expect(runSchema(standardNumber(1), 5)).toEqual({ success: true, data: 5 });

    const failed = runSchema(standardNumber(1), 0);
    expect(failed.success).toBe(false);
    if (!failed.success) expect(failed.error.issues[0]?.message).toMatch(/>= 1/);
  });

  it('prefers the structural path for schemas that implement both (zod)', () => {
    const schema = z.number();
    expect('~standard' in schema).toBe(true); // zod 4 implements Standard Schema...
    expect(runSchema(schema, 5)).toMatchObject({ success: true, data: 5 }); // ...but safeParse runs
  });

  it('rejects an async validator with a clear error', () => {
    expect(() => runSchema(asyncSchema, 5)).toThrow(/Async validation is not supported/);
  });
});

describe('standard schemas as codec schemas', () => {
  const form = defineForm<void>()({
    resolve: (f: Fields) => ({
      steps: f.field(
        'steps',
        codec<number>({ output: standardNumber(1), input: standardNumber(0), default: 10 })
      ),
    }),
  });

  it('validates output through a standard schema', () => {
    const ok = form.parse({ steps: 5 }, undefined);
    expect(ok.success).toBe(true);

    const bad = form.parse({ steps: 0 }, undefined);
    // input schema (min 0) accepts it; output schema (min 1) rejects it
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.errors.steps?.message).toMatch(/>= 1/);
  });

  it('runs boundary input through a standard schema with default fallback', () => {
    const result = form.parse({ steps: 'nope' }, undefined);
    // input schema fails -> default 10 -> output passes
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.steps).toBe(10);
  });
});
