import { z } from 'zod';
import { codec, defineFieldKit } from '../core/index.js';

/**
 * Port of quantityNode. v1 rebuilds the schema per ecosystem/limits change to
 * carry `.max(max)`; here the codec is static and the live max (from ext
 * limits, or an ecosystem's vidQuantity) binds through projection — same
 * effective behaviour, since v1's input transform snapped into range anyway.
 */

export interface QuantityMeta {
  min: number;
  max: number;
  step: number;
}

const snap = (val: number, step: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round((val - min) / step) * step + min));

const QUANTITY = codec<number, QuantityMeta>({
  input: z.coerce.number().optional(),
  output: z.number().min(1),
  default: 1,
});

export const createQuantityKit = defineFieldKit<
  { step?: number },
  { max: number; min?: number },
  number,
  QuantityMeta
>({
  key: 'quantity',
  codec: QUANTITY,
  options: (config, args) => {
    const step = config.step ?? 1;
    const min = args.min ?? step;
    return {
      default: min,
      project: (value) => snap(value, step, min, args.max),
      meta: { min, max: args.max, step },
    };
  },
});
