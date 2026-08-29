import { numberCodec, type NumberMeta } from '../../codecs/basic.js';
import type { Codec } from '../../core/types.js';

export interface PresetNumberMeta extends NumberMeta {
  presets: { label: string; value: number }[];
}

/** A bounded number whose control offers named preset values (v1 slider chips). */
export function presetNumberCodec(
  opts: Parameters<typeof numberCodec>[0] & { presets: { label: string; value: number }[] }
): Codec<number, PresetNumberMeta> {
  const base = numberCodec(opts);
  return { ...base, meta: { ...(base.meta as NumberMeta), presets: opts.presets } };
}
