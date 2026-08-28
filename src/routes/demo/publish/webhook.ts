import { z } from 'zod';
import { codec, defineSection } from '$lib/index.js';
import { enumCodec } from '$lib/codecs/index.js';
import { retriesField } from './shared.js';

export const webhookDestination = defineSection({
  key: 'webhook',
  label: 'Webhook',

  codecs: {
    url: codec({
      input: z.string().optional(),
      output: z.string().url('A full https:// URL'),
      default: '',
    }),
    secret: codec({
      input: z.string().optional(),
      output: z.string().min(8, 'Signing secret needs 8+ characters'),
      default: '',
    }),
    method: enumCodec({
      options: [
        { value: 'POST', label: 'POST' },
        { value: 'PUT', label: 'PUT' },
      ],
      default: 'POST',
    }),
  },

  resolve: (f) => ({
    url: f.field('url'),
    secret: f.field('secret'),
    method: f.field('method'),
    // Same `retries` key as the email destination — scope keeps each
    // destination's remembered value separate.
    retries: retriesField(f, 'webhook'),
  }),
});
