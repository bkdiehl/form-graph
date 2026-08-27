import { z } from 'zod';
import { codec, type Codec } from '../core/index.js';

/**
 * A closed string-option field: input projects unknown values to the
 * default, output is the exact enum. Meta carries the option list (and
 * optional presets) for the control.
 */

export interface SelectMeta {
  options: { label: string; value: string }[];
  presets?: { label: string; value: string }[];
}

export function selectCodec(opts: {
  options: readonly string[];
  default?: string;
  presets?: { label: string; value: string }[];
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
    meta: { options: values.map((s) => ({ label: s, value: s })), presets: opts.presets },
  });
}
