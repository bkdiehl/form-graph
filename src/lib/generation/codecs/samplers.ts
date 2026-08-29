import { defineFieldKit } from '../../core/field-kit.js';
import type { Codec } from '../../core/types.js';
import { selectCodec, type SelectMeta } from '../../codecs/select.js';

// Port of samplerNode / schedulerNode: named kits over selectCodec, one
// instance per ecosystem module with that ecosystem's option list. Preset
// chips are product behavior, so the meta extension lives here, not on the
// public SelectMeta.

export interface PresetSelectMeta extends SelectMeta {
  presets?: { label: string; value: string }[];
}

function presetSelectCodec(opts: {
  options: readonly string[];
  default?: string;
  presets?: { label: string; value: string }[];
}): Codec<string, PresetSelectMeta> {
  const base = selectCodec(opts);
  // selectCodec always builds its meta as a static literal, never the fn form
  return { ...base, meta: { ...(base.meta as SelectMeta), presets: opts.presets } };
}

const defaultSamplerPresets = [
  { label: 'Fast', value: 'Euler a' },
  { label: 'Popular', value: 'DPM++ 2M Karras' },
];

export const createSamplerKit = defineFieldKit<
  { options: readonly string[]; default?: string; presets?: { label: string; value: string }[] },
  void,
  string,
  PresetSelectMeta
>({
  key: 'sampler',
  codec: (config) =>
    presetSelectCodec({ ...config, presets: config.presets ?? defaultSamplerPresets }),
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
