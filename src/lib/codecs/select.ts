import { z } from 'zod';
import { codec } from '../core/codec.js';
import { type Codec } from '../core/types.js';

/**
 * Legacy closed string-option codec — INTERNAL to the generation demo corpus.
 * New code uses `enumOf`.
 */

export interface SelectMeta {
  options: { label: string; value: string; disabled?: boolean }[];
}

export function selectCodec(opts: {
  options: readonly string[];
  default?: string;
}): Codec<string, SelectMeta> {
  const values = opts.options;
  const resolvedDefault =
    opts.default && values.includes(opts.default) ? opts.default : values[0]!;

  return codec<string, SelectMeta>({
    input: z
      .string()
      .optional()
      .transform((val) => (val === undefined ? undefined : values.includes(val) ? val : resolvedDefault)),
    output: z.enum(values as [string, ...string[]]),
    default: resolvedDefault,
    coerce: (raw) => (values.includes(raw as string) ? (raw as string) : resolvedDefault),
    meta: { options: values.map((s) => ({ label: s, value: s })) },
  });
}
