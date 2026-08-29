import { z } from 'zod';
import { defineGraph } from '$lib/index.js';
import { boolOf, enumOf, slider } from '$lib/codecs/index.js';

export const emailGraph = defineGraph()
  .field('recipients', {
    input: z.string().optional(),
    output: z
      .string()
      .min(1, 'At least one recipient')
      .refine(
        (s) => s.split(',').every((part) => z.string().email().safeParse(part.trim()).success),
        'Comma-separated email addresses'
      ),
    default: '',
  })
  .field('digest', boolOf())
  .field('digestFrequency', (ctx) =>
    ctx.digest
      ? enumOf({
          options: [
            { value: 'immediate', label: 'Immediate' },
            { value: 'daily', label: 'Daily digest' },
            { value: 'weekly', label: 'Weekly digest' },
          ],
          default: 'daily',
        })
      : null
  )
  // Same `retries` key as the webhook destination — scope keeps each
  // destination's remembered value separate.
  .field('retries', { ...slider({ min: 0, max: 10, default: 3 }), scope: 'email' });

export const emailMeta = { key: 'email', label: 'Email' } as const;
