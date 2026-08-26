import { z } from 'zod';
import { codec, defineFieldKit, type Codec } from '../core/index.js';

/**
 * Port of selectNode / samplerNode / schedulerNode. `selectCodec` is the
 * anonymous value shape; the kits are the NAMED fields built on it — one kit
 * instance per ecosystem module, hoisted, with that ecosystem's option list.
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

const defaultSamplerPresets = [
  { label: 'Fast', value: 'Euler a' },
  { label: 'Popular', value: 'DPM++ 2M Karras' },
];

export const createSamplerKit = defineFieldKit<
  { options: readonly string[]; default?: string; presets?: { label: string; value: string }[] },
  void,
  string,
  SelectMeta
>({
  key: 'sampler',
  codec: (config) =>
    selectCodec({ ...config, presets: config.presets ?? defaultSamplerPresets }),
});

export const createSchedulerKit = defineFieldKit<
  { options: readonly string[]; default?: string },
  void,
  string,
  SelectMeta
>({
  key: 'scheduler',
  codec: (config) => selectCodec(config),
});
