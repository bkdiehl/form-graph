import { toFieldError } from './intent.js';
import { runSchema } from './run-schema.js';
import type { Resolution } from './resolve.js';
import type { FieldError } from './types.js';

/**
 * Runs output schemas over an already-resolved set of fields.
 *
 * Deliberately separate from resolution: output validation happens on demand
 * (submit, whatIf, server parse) and never on the keystroke path.
 */
export function validateResolution<State>(resolution: Resolution<State>): {
  errors: Map<string, FieldError>;
  data: Record<string, unknown>;
} {
  const errors = new Map<string, FieldError>();
  const data: Record<string, unknown> = {};

  for (const key of resolution.keys) {
    const record = resolution.records.get(key)!;

    if (!record.codec) {
      data[key] = record.value;
      continue;
    }

    const result = runSchema(record.codec.output, record.value);
    if (result.success) {
      const message = record.validate?.(record.value);
      if (message) {
        data[key] = record.value;
        errors.set(key, { message, code: 'custom', issues: [{ message, code: 'custom' }] });
        continue;
      }
      data[key] = record.codec.toOutput ? record.codec.toOutput(record.value) : result.data;
    } else {
      data[key] = record.value;
      errors.set(key, toFieldError(result.error.issues));
    }
  }

  return { errors, data };
}
