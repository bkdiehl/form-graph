import { numberCodec, type NumberConstraint, type NumberMeta } from '../../codecs/basic.js';
import type { Codec } from '../../core/types.js';

export interface PresetNumberMeta extends NumberMeta {
  presets: { label: string; value: number }[];
}

/** A bounded number whose control offers named preset values (v1 slider chips). */
export function presetNumberCodec(
  opts: Parameters<typeof numberCodec>[0] & { presets: { label: string; value: number }[] }
): Codec<number, PresetNumberMeta, NumberConstraint> {
  const base = numberCodec(opts);
  const withPresets = (meta: NumberMeta | undefined): PresetNumberMeta => ({
    ...(meta as NumberMeta),
    presets: opts.presets,
  });
  return {
    ...base,
    meta: withPresets(base.meta as NumberMeta),
    constrain: ({ value, meta, constraint }) => {
      const r = base.constrain!({ value, meta, constraint });
      return { ...r, meta: withPresets(r.meta ?? meta) };
    },
  };
}
