import { toFieldError } from './intent.js';
import { runSchema } from './run-schema.js';
import type { Resolution } from './resolve.js';
import type { FieldError, FieldRecord } from './types.js';

// Group-key separator between a list path and an element id. A space is
// unambiguous: ids are engine-minted (deterministic seeds or base36) and can
// never contain one, so the LAST space always splits path from id.
const SEP = ' ';

/**
 * Runs output schemas over an already-resolved set of fields.
 *
 * Deliberately separate from resolution: output validation happens on demand
 * (submit, whatIf, server parse) and never on the keystroke path.
 *
 * List handling: element records (`record.element`) validate exactly like
 * root fields — errors keyed by their full path key — but their outputs
 * assemble into per-element objects, and each list's data entry is the
 * ordered array of those objects (member wire names apply WITHIN the
 * element). Wire-name claims are per element: every element legitimately
 * emits the same names.
 */
export function validateResolution<State>(resolution: Resolution<State>): {
  errors: Map<string, FieldError>;
  data: Record<string, unknown>;
} {
  const errors = new Map<string, FieldError>();
  const data: Record<string, unknown> = {};

  const GROUP_ROOT = '';
  const groupOf = (record: FieldRecord): string =>
    record.element ? record.element.list + SEP + record.element.id : GROUP_ROOT;
  /** The name a record emits under WITHIN its group: bare member key inside an element. */
  const wireBase = (record: FieldRecord): string =>
    record.element ? record.key.slice(record.key.lastIndexOf('.') + 1) : record.key;

  const groups = new Map<string, FieldRecord[]>();
  const listRecords: FieldRecord[] = [];
  for (const key of resolution.keys) {
    const record = resolution.records.get(key)!;
    if (record.list) {
      listRecords.push(record);
      continue; // membership ids are internal; its data is the assembled array
    }
    const group = groupOf(record);
    let bucket = groups.get(group);
    if (!bucket) groups.set(group, (bucket = []));
    bucket.push(record);
  }

  // Each list's wire is claimed in ITS group before fields run, so a field
  // or computed colliding with a list key fails the same way any duplicate
  // wire does — a list must not silently clobber a claimed name.
  const reserved = new Map<string, Map<string, string>>();
  for (const record of listRecords) {
    if (record.emit === false) continue;
    const group = groupOf(record);
    const wire = record.emit ?? wireBase(record);
    let claims = reserved.get(group);
    if (!claims) reserved.set(group, (claims = new Map()));
    const prior = claims.get(wire);
    if (prior !== undefined) {
      throw new Error(`Duplicate wire key "${wire}": emitted by both "${prior}" and "${record.key}".`);
    }
    claims.set(wire, record.key);
  }

  const elementOutputs = new Map<string, Record<string, unknown>>();
  for (const [group, records] of groups) {
    const target =
      group === GROUP_ROOT ? data : (elementOutputs.set(group, {}), elementOutputs.get(group)!);
    validateGroup(records, wireBase, target, errors, reserved.get(group));
  }

  // Innermost lists first: a nested list's assembled array must land in its
  // parent element's output before the parent list assembles. A nested
  // list's path key strictly extends its parent's, so key length orders it.
  listRecords.sort((a, b) => b.key.length - a.key.length);
  for (const record of listRecords) {
    const { ids } = record.list!;
    const assembled = ids.map((id) => elementOutputs.get(record.key + SEP + id) ?? {});
    if (record.emit === false) continue;
    const wire = record.emit ?? wireBase(record);
    if (record.element) {
      const parent = elementOutputs.get(groupOf(record));
      if (parent) parent[wire] = assembled;
    } else {
      data[wire] = assembled;
    }
  }

  return { errors, data };
}

function validateGroup(
  records: readonly FieldRecord[],
  wireBase: (record: FieldRecord) => string,
  target: Record<string, unknown>,
  errors: Map<string, FieldError>,
  reservedWires?: ReadonlyMap<string, string>
): void {
  // wire name -> graph key (within this group), pre-seeded with list claims
  const emitted = new Map<string, string>(reservedWires ?? []);

  // A computed's emit takes a wire name over the field of that name — the
  // derived value is BY DEFINITION the one the wire should carry, so the
  // field needs no emit:false of its own. Two computeds claiming one name
  // stay an error: neither is more derived than the other.
  const computedWires = new Set<string>();
  for (const record of records) {
    if (record.isComputed && typeof record.emit === 'string') computedWires.add(record.emit);
  }

  const claim = (record: FieldRecord): string | null => {
    if (record.emit === false) return null;
    const wire = record.emit ?? wireBase(record);
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

  for (const record of records) {
    if (!record.codec) {
      const wire = claim(record);
      if (wire !== null) target[wire] = record.value;
      continue;
    }

    // The refined schema (when the field declared `refine`) IS the output
    // contract for this pass — the codec's output narrowed by the current
    // conditions.
    const wire = claim(record);
    const result = runSchema(record.refined ?? record.codec.output, record.value);
    if (result.success) {
      if (wire !== null)
        target[wire] = record.codec.toOutput ? record.codec.toOutput(record.value) : result.data;
    } else {
      if (wire !== null) target[wire] = record.value;
      // Errors key by GRAPH name, always (the full path for element fields):
      // an error describes a FIELD the user must fix, and the graph key is
      // what snapshots, scoped validate and setError address fields by.
      // Only DATA carries wire names.
      errors.set(record.key, toFieldError(result.error.issues));
    }
  }
}
