import { z } from 'zod';
import { codec, type Codec } from '../core/index.js';
import type { EnumConstraint } from './basic.js';

/**
 * A closed string-option field: input projects unknown values to the
 * default, output is the exact enum. Meta carries the option list for the
 * control.
 */

export interface SelectMeta {
  options: { label: string; value: string; disabled?: boolean }[];
}

export function selectCodec(opts: {
  options: readonly string[];
  default?: string;
}): Codec<string, SelectMeta, EnumConstraint<string>> {
  const values = opts.options;
  const resolvedDefault =
    opts.default && values.includes(opts.default) ? opts.default : values[0]!;

  return codec<string, SelectMeta, EnumConstraint<string>>({
    input: z
      .string()
      .optional()
      .transform((val) => (val === undefined ? undefined : values.includes(val) ? val : resolvedDefault)),
    output: z.enum(values as [string, ...string[]]),
    default: resolvedDefault,
    coerce: (raw) => (values.includes(raw as string) ? (raw as string) : resolvedDefault),
    meta: { options: values.map((s) => ({ label: s, value: s })) },
    constrain: ({ value, meta, constraint }) => {
      const options = (meta?.options ?? []).map((o) =>
        typeof constraint[o.value] === 'string' ? { ...o, disabled: true } : o
      );
      const reason = constraint[value];
      if (typeof reason !== 'string') return { value, meta: { options } };
      const target = options.find((o) => !o.disabled);
      return {
        value: target ? target.value : value,
        meta: { options },
        reason,
        detail: { gated: value },
      };
    },
  });
}
