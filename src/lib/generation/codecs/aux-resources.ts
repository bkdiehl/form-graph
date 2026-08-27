import { z } from 'zod';
import { codec, defineFieldKit } from '../../core/index.js';
import { resourceSchema, type ResourceValue } from './resources.js';

/**
 * Ports of vaeNode/createVaeGraph and upscalerNode.
 *
 * The VAE's "clear when incompatible with the new ecosystem" effect becomes
 * projection: an incompatible VAE simply doesn't survive resolution, client and
 * server alike. Upscalers are ecosystem-independent, so that kit is all codec.
 */

const singleResourceInput = z
  .union([z.number().transform((id) => ({ id })), z.looseObject({ id: z.number() })])
  .optional()
  .transform((val) => val as ResourceValue | undefined);

export interface AuxResourceMeta {
  options: { canGenerate: boolean; excludeIds: number[] };
}

const VAE = codec<ResourceValue | undefined, AuxResourceMeta>({
  input: singleResourceInput,
  output: resourceSchema.optional() as unknown as z.ZodType<ResourceValue | undefined>,
});

export const createVaeKit = defineFieldKit<
  { isCompatible: (ecosystem: string, vae: ResourceValue) => boolean },
  { ecosystem: string },
  ResourceValue | undefined,
  AuxResourceMeta
>({
  key: 'vae',
  codec: VAE,
  options: () => ({
    meta: (value) => ({
      options: { canGenerate: true, excludeIds: value ? [value.id] : [] },
    }),
  }),
  correct: (vae, config, args) =>
    vae && vae.baseModel && !config.isCompatible(args.ecosystem, vae)
      ? { value: undefined, reason: 'ecosystem_incompatible', detail: { ecosystem: args.ecosystem } }
      : undefined,
});

export const createUpscalerKit = defineFieldKit<
  { defaultId: number },
  void,
  ResourceValue,
  AuxResourceMeta
>({
  key: 'upscaler',
  codec: (config) =>
    codec<ResourceValue, AuxResourceMeta>({
      input: singleResourceInput,
      output: resourceSchema as unknown as z.ZodType<ResourceValue>,
      default: { id: config.defaultId, model: { type: 'Upscaler' } },
      meta: (value) => ({
        options: { canGenerate: true, excludeIds: value ? [value.id] : [] },
      }),
    }),
});
