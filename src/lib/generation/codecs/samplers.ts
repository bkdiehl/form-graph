import { defineFieldKit } from '../../core/index.js';
import { selectCodec, type SelectMeta } from '../../codecs/select.js';

// Port of samplerNode / schedulerNode: named kits over selectCodec, one
// instance per ecosystem module with that ecosystem's option list.

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
