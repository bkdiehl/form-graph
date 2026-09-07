import { inheritedScopeParts, type AnyFieldDef, type GraphSource } from './graph.js';
import type { Fields, ListFields } from './resolve.js';
import type { SafeParseResult, SchemaLike } from './types.js';

/**
 * `list()` — the collection combinator (proposal-0.4.md §1).
 *
 * Mounts a member graph N times, once per element, each under the dotted
 * path prefix `listKey[itemId].` (docs/array-intent-addressing.md). Element
 * records stay FLAT in the resolution under their full path keys, which is
 * what keeps diff, subscriptions, scoped validate and setError list-aware
 * with no new machinery; state carries the assembled `MemberState[]` under
 * the list key, and parsed data carries per-element member DATA (see
 * validateResolution's grouping).
 *
 * The list's own record holds membership: the ordered id array, at the
 * list's own intent address. Seed ids are DETERMINISTIC (`s0`..`s{min-1}`)
 * — identities, not indices: a fresh session re-derives the same seeds, so
 * per-element persistence binds across sessions without persisting the
 * untouched membership; ids minted by `add()` are random and land in
 * durable intent with the op that created them.
 */
export interface ListOptions {
  /** Fewest elements the list may hold; `remove` below it refuses. Default 1. */
  min?: number;
  /** Most elements; `add`/`duplicate` above it refuse. Default unbounded. */
  max?: number;
}

function safeParseIds(value: unknown): SafeParseResult<readonly string[]> {
  if (Array.isArray(value) && value.every((x) => typeof x === 'string')) {
    // de-dup defensively: a tampered stored membership must not resolve
    // one element twice (duplicate keys would throw in the collector)
    return { success: true, data: [...new Set(value as string[])] };
  }
  return {
    success: false,
    error: { issues: [{ message: 'expected an array of element ids' }] },
  };
}

const idArraySchema: SchemaLike<readonly string[]> = {
  safeParse: safeParseIds,
  parse(value: unknown): readonly string[] {
    const result = safeParseIds(value);
    if (!result.success) throw new Error('expected an array of element ids');
    return result.data;
  },
};

export const seedIds = (n: number): string[] => Array.from({ length: n }, (_, i) => `s${i}`);

export function list<
  K extends string,
  C2 extends object,
  X2,
  D2 extends Record<string, AnyFieldDef>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  W2 extends Record<string, any>,
>(
  key: K,
  member: GraphSource<C2, X2, D2, W2>,
  options: ListOptions = {}
  // Defs contribution is EMPTY on purpose: member field keys are not root
  // keys, and merging them would collide across lists. Typed element access
  // goes through the element-scoped bindings, not the flat registry.
): GraphSource<Record<K, C2[]>, X2, Record<never, never>, Record<never, never>> {
  const min = options.min ?? 1;
  const max = options.max ?? Number.POSITIVE_INFINITY;
  if (min < 0 || max < min) {
    throw new Error(`list("${key}"): invalid bounds (min ${min}, max ${max}).`);
  }

  const membershipCodec = {
    input: idArraySchema,
    output: idArraySchema,
    default: () => seedIds(min),
  };

  return {
    defs: {},
    effects: [],
    resolve(f: Fields, ext?: unknown): Record<K, C2[]> {
      const lf = f as ListFields;
      const listPath = lf.__listPath(key);

      const inherited = inheritedScopeParts();
      let ids = lf.field(key, membershipCodec, {
        scope: inherited.length ? inherited : undefined,
      }) as readonly string[];

      // Bounds are op-enforced; an ARRAY outside them (tampered storage, raw
      // server input) is corrected with a note. A non-array falls to the
      // seeded default through the ordinary boundary path — observable as
      // the membership record's boundaryError, like any bad stored value.
      if (ids.length < min || ids.length > max) {
        const padded = [...ids];
        for (let i = 0; padded.length < min; i++) {
          const seed = `s${i}`;
          if (!padded.includes(seed)) padded.push(seed);
        }
        ids = lf.correct(key, padded.slice(0, max), 'list_bounds') as readonly string[];
      }
      lf.__annotateList(key, { ids, min, max });

      const elements: C2[] = [];
      for (const id of ids) {
        lf.__pushElement(listPath, id);
        try {
          elements.push((member.resolve as (f: Fields, ext?: unknown) => C2)(f, ext));
        } finally {
          lf.__popElement();
        }
      }
      return { [key]: elements } as Record<K, C2[]>;
    },
  };
}
