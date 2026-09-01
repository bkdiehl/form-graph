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
  const emitted = new Map<string, string>(); // wire name -> graph key

  // A computed's emit takes a wire name over the field of that name — the
  // derived value is BY DEFINITION the one the wire should carry, so the
  // field needs no emit:false of its own. Two computeds claiming one name
  // stay an error: neither is more derived than the other.
  const computedWires = new Set<string>();
  for (const key of resolution.keys) {
    const record = resolution.records.get(key)!;
    if (record.isComputed && typeof record.emit === 'string') computedWires.add(record.emit);
  }

  const claim = (record: {
    key: string;
    emit?: false | string;
    isComputed?: boolean;
  }): string | null => {
    if (record.emit === false) return null;
    const wire = record.emit ?? record.key;
    if (!record.isComputed && computedWires.has(wire)) return null;
    const prior = emitted.get(wire);
    if (prior !== undefined) {
      throw new Error(
        `Duplicate wire key "${wire}": emitted by both "${prior}" and "${record.key}". Exactly one computed may emit a wire name.`
      );
    }
    emitted.set(wire, record.key);
    return wire;
  };

  for (const key of resolution.keys) {
    const record = resolution.records.get(key)!;

    if (!record.codec) {
      const wire = claim(record);
      if (wire !== null) data[wire] = record.value;
      continue;
    }

    // The refined schema (when the field declared `refine`) IS the output
    // contract for this pass — the codec's output narrowed by the current
    // conditions.
    const wire = claim(record);
    const result = runSchema(record.refined ?? record.codec.output, record.value);
    if (result.success) {
      if (wire !== null)
        data[wire] = record.codec.toOutput ? record.codec.toOutput(record.value) : result.data;
    } else {
      if (wire !== null) data[wire] = record.value;
      // an emit:false field still GUARDS — its error keys by graph name
      errors.set(wire ?? key, toFieldError(result.error.issues));
    }
  }

  return { errors, data };
}
