import { z } from 'zod';
import { codec } from '../../core/codec.js';

/**
 * Port of aspectRatioNode. The value is the full option object (value + pixel
 * dimensions), and the input codec is where v1's leniency lives: exact match,
 * closest-by-ratio for `{width,height}` or `"W:H"` strings, default otherwise.
 */

export interface AspectRatioOption {
  label: string;
  value: string;
  width: number;
  height: number;
}

export type AspectRatioValue = { value: string; width: number; height: number };

export interface AspectRatioMeta {
  options: AspectRatioOption[];
  priorityOptions?: string[];
}

function findClosest(
  target: { width: number; height: number },
  options: AspectRatioOption[]
): AspectRatioOption {
  const ratio = target.width / target.height;
  let best = options[0]!;
  let bestDelta = Infinity;
  for (const option of options) {
    const delta = Math.abs(Math.log(option.width / option.height) - Math.log(ratio));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = option;
    }
  }
  return best;
}

export function aspectRatioCodec(opts: {
  options: AspectRatioOption[];
  default?: string;
  priorityOptions?: string[];
}) {
  const { options } = opts;
  const defaultOption = options.find((o) => o.value === (opts.default ?? '1:1')) ?? options[0]!;

  const resolveInput = (val: string | { value: string; width?: number; height?: number }) => {
    const value = typeof val === 'string' ? val : val.value;
    const exact = options.find((o) => o.value === value);
    if (exact) return exact;

    if (typeof val === 'object' && val.width && val.height) {
      return findClosest({ width: val.width, height: val.height }, options);
    }
    const parts = value.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]!) && !isNaN(parts[1]!)) {
      return findClosest({ width: parts[0]!, height: parts[1]! }, options);
    }
    return defaultOption;
  };

  return codec<AspectRatioValue, AspectRatioMeta>({
    input: z
      .union([
        z.string(),
        z.object({ value: z.string(), width: z.number().optional(), height: z.number().optional() }),
      ])
      .optional()
      .transform((val) => (val ? resolveInput(val) : defaultOption)),
    output: z.object({ value: z.string(), width: z.number(), height: z.number() }),
    default: defaultOption,
    // Trusted writes may pass a bare ratio string from a select control.
    coerce: (raw) =>
      typeof raw === 'string' ? resolveInput(raw) : (raw as AspectRatioValue),
    meta: { options, priorityOptions: opts.priorityOptions },
  });
}
