import type { FormDefinition } from './form.js';
import { trustedEntry, type Intent } from './intent.js';

/**
 * Structural questions, answered by EXECUTING resolvers rather than walking a
 * graph. This is the capability the resolver model trades away by making
 * definitions code instead of data, so it is rebuilt here explicitly.
 *
 * The enumeration is driven by the form's own `meta.options` — the same data the
 * pickers render — so there is no separate branch table to keep in sync.
 */

export type Pins = Record<string, unknown>;

const pin = (pins: Pins): Intent =>
  new Map(Object.entries(pins).map(([key, value]) => [key, trustedEntry(value)]));

/** Active field keys for a given set of pinned values. */
export function fieldKeys<State, Ext>(
  definition: FormDefinition<State, Ext>,
  pins: Pins,
  ext: Ext
): string[] {
  return definition.resolve(pin(pins), ext).keys;
}

/**
 * Does this field exist under these choices, with everything unpinned
 * resolved to its default?
 *
 * More accurate than a structural walk, which has to guess at conditions it
 * cannot evaluate — here the real resolver decides.
 */
export function hasField<State, Ext>(
  definition: FormDefinition<State, Ext>,
  key: string,
  pins: Pins,
  ext: Ext
): boolean {
  return definition.resolve(pin(pins), ext).records.has(key);
}

/**
 * The resolved META of one field under pinned values — e.g. read a select
 * field's option list per combination of its upstream discriminants.
 */
export function fieldMeta<State, Ext>(
  definition: FormDefinition<State, Ext>,
  key: string,
  pins: Pins,
  ext: Ext
): unknown {
  return definition.resolve(pin(pins), ext).records.get(key)?.meta;
}

/** Candidate values for a discriminant, read from the field's own `meta.options`. */
export function optionsFor<State, Ext>(
  definition: FormDefinition<State, Ext>,
  key: string,
  pins: Pins,
  ext: Ext
): unknown[] {
  const meta = definition.resolve(pin(pins), ext).records.get(key)?.meta as
    | { options?: readonly unknown[] }
    | undefined;

  return (meta?.options ?? []).map((option) =>
    option !== null && typeof option === 'object' && 'value' in option
      ? (option as { value: unknown }).value
      : option
  );
}

export interface BranchDescription {
  /** The pinned values that produced this leaf. */
  pins: Pins;
  keys: string[];
}

/**
 * Walks `axes` (the form's discriminant fields, in order) breadth-first,
 * expanding each axis over its own `meta.options`, and returns one entry per
 * reachable combination.
 *
 * An axis that is not active under the current pins is simply skipped, so
 * branches where a later discriminant never appears terminate early instead
 * of needing a special case.
 */
export function enumerateBranches<State, Ext>(
  definition: FormDefinition<State, Ext>,
  axes: readonly string[],
  ext: Ext,
  basePins: Pins = {}
): BranchDescription[] {
  const [axis, ...rest] = axes;
  const resolution = definition.resolve(pin(basePins), ext);

  if (!axis || !resolution.records.has(axis)) {
    return [{ pins: basePins, keys: resolution.keys }];
  }

  const options = optionsFor(definition, axis, basePins, ext);
  if (options.length === 0) {
    return [{ pins: basePins, keys: resolution.keys }];
  }

  return options.flatMap((value) =>
    enumerateBranches(definition, rest, ext, { ...basePins, [axis]: value })
  );
}

/**
 * Every combination of the axes in which a field appears. Answers "which
 * branches carry this field?" without hard-coding a list.
 */
export function whereFieldExists<State, Ext>(
  definition: FormDefinition<State, Ext>,
  key: string,
  axes: readonly string[],
  ext: Ext
): BranchDescription[] {
  return enumerateBranches(definition, axes, ext).filter((branch) =>
    branch.keys.includes(key)
  );
}

/** Every field key reachable through `axes`. */
export function allPossibleKeys<State, Ext>(
  definition: FormDefinition<State, Ext>,
  axes: readonly string[],
  ext: Ext
): string[] {
  const keys = new Set<string>();
  for (const branch of enumerateBranches(definition, axes, ext)) {
    for (const key of branch.keys) keys.add(key);
  }
  return [...keys];
}
