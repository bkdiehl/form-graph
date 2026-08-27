import { z } from 'zod';
import { codec, defineFieldKit } from '../core/index.js';

/**
 * Port of resourceSchema / resourcesNode / createResourcesGraph.
 *
 * State deliberately holds MORE than the output: the input schema is loose
 * (hydrated provider objects pass through untouched), while the strict output
 * schema strips everything down to what the server accepts — v1's two-views
 * behaviour, without the "don't write parsed values back" special case.
 */

export const resourceSchema = z.object({
  id: z.number(),
  baseModel: z.string().optional(),
  model: z.object({ type: z.string() }),
  strength: z.number().optional(),
  trainedWords: z.array(z.string()).optional(),
  epochDetails: z.object({ epochNumber: z.number().optional() }).optional(),
});

export type ResourceData = z.infer<typeof resourceSchema>;

/**
 * What STATE holds: at minimum an id. Un-hydrated stubs (`{ id }` from a URL or
 * remix) live here legitimately — as in v1, they fail output validation until
 * hydration fills them in, which is what prompts hydration before submit.
 */
export type ResourceValue = { id: number } & Partial<Omit<ResourceData, 'id'>>;

const looseResource = z.looseObject({ id: z.number() });
const resourceInput = z.union([z.number().transform((id) => ({ id })), looseResource]);

export interface ResourcesMeta {
  options: { canGenerate: boolean; excludeIds: number[] };
  limit: number;
}

/** Which resources an ecosystem accepts — the app injects the real tables. */
export type ResourceCompatibility = (ecosystem: string, resource: ResourceValue) => boolean;

export const RESOURCES = codec<ResourceValue[], ResourcesMeta>({
  // The trailing cast is the boundary's only lie, and a safe one: the union
  // guarantees `id`, and extra hydrated keys are the point of loose state.
  input: resourceInput
    .array()
    .optional()
    .transform((arr) => arr as ResourceValue[] | undefined),
  output: resourceSchema.array() as unknown as z.ZodType<ResourceValue[]>,
  default: [],
});

export interface ResourcesFieldArgs {
  ecosystem: string;
  limit: number;
  /** Persist per this scope (typically the ecosystem group). Default: the ecosystem. */
  scope?: string | number;
}

/**
 * The resources kit — replaces resourcesNode's factory + deps + the
 * compatibility effect. Ecosystem compatibility and the live ext limit are
 * enforced by projection, so they bind on the server too.
 */
export const createResourcesKit = defineFieldKit<
  { isCompatible: ResourceCompatibility },
  ResourcesFieldArgs,
  ResourceValue[],
  ResourcesMeta
>({
  key: 'resources',
  codec: RESOURCES,
  options: (config, args) => ({
    scope: args.scope ?? args.ecosystem,
    correct: (value) =>
      value.filter((resource) => config.isCompatible(args.ecosystem, resource)).slice(0, args.limit),
    meta: (value) => ({
      options: { canGenerate: true, excludeIds: value.map((r) => r.id) },
      limit: args.limit,
    }),
  }),
});
