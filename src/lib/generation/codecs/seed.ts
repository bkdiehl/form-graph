import { z } from 'zod';
import { codec } from '../../core/codec.js';

// Port of seedNode: null (UI clear) and numeric strings (URLs) normalise.
export const MAX_SEED = 4294967967;

export function seedCodec() {
  return codec<number | undefined>({
    input: z
      .union([z.null(), z.undefined(), z.coerce.number().int().min(1).max(MAX_SEED)])
      .optional()
      .transform((v) => (v === null ? undefined : v)),
    output: z.number().int().min(1).max(MAX_SEED).optional(),
  });
}
