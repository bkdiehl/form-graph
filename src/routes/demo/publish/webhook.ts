import { z } from 'zod';
import { defineGraph } from '$lib/index.js';
import { enumOf, slider } from '$lib/codecs/index.js';

export const webhookGraph = defineGraph()
  .field('url', {
    input: z.string().optional(),
    output: z.string().url('A full https:// URL'),
    default: '',
  })
  .field('secret', {
    input: z.string().optional(),
    output: z.string().min(8, 'Signing secret needs 8+ characters'),
    default: '',
  })
  .field('method', enumOf({
    options: [
      { value: 'POST', label: 'POST' },
      { value: 'PUT', label: 'PUT' },
    ],
    default: 'POST',
  }))
  .field('retries', { ...slider({ min: 0, max: 10, default: 3 }), scope: 'webhook' });

export const webhookMeta = { key: 'webhook', label: 'Webhook' } as const;
