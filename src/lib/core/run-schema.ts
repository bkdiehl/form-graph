import type { SafeParseResult, Schema, SchemaLike } from './types.js';

/**
 * Runs either schema flavor — the structural `parse`/`safeParse` contract or a
 * Standard Schema (`~standard.validate`) — behind one result shape. This is the
 * only place the engine touches a schema, so supporting a new flavor is a
 * change here, not a sweep.
 */
export function runSchema<T>(schema: SchemaLike<T>, value: unknown): SafeParseResult<T> {
  // Structural first: zod implements BOTH contracts, and its native safeParse is
  // the more battle-tested path. `~standard` handles everything else (valibot,
  // arktype, hand-written standard schemas).
  if (hasSafeParse(schema)) {
    return schema.safeParse(value);
  }
  if ('~standard' in schema) {
    const result = schema['~standard'].validate(value);
    if (result instanceof Promise) {
      throw new Error(
        `Async validation is not supported (vendor "${schema['~standard'].vendor}"). ` +
          `Resolution is synchronous by design — use a sync schema.`
      );
    }
    if (result.issues) {
      return { success: false, error: { issues: result.issues } };
    }
    return { success: true, data: result.value };
  }
  throw new Error('Schema implements neither safeParse nor ~standard.validate.');
}

function hasSafeParse<T>(schema: SchemaLike<T>): schema is Schema<T> {
  return typeof (schema as Schema<T>).safeParse === 'function';
}
