import { z } from 'zod';
import { codec, defineSection } from '$lib/index.js';
import { enumCodec } from '$lib/codecs/index.js';
import { retriesField } from './shared.js';

export const emailDestination = defineSection({
  key: 'email',
  label: 'Email',

  codecs: {
    recipients: codec({
      input: z.string().optional(),
      output: z
        .string()
        .min(1, 'At least one recipient')
        .refine(
          (s) => s.split(',').every((part) => z.string().email().safeParse(part.trim()).success),
          'Comma-separated email addresses'
        ),
      default: '',
    }),
    digest: codec({
      input: z.boolean().optional(),
      output: z.boolean(),
      default: false,
    }),
    digestFrequency: enumCodec({
      options: [
        { value: 'immediate', label: 'Immediate' },
        { value: 'daily', label: 'Daily digest' },
        { value: 'weekly', label: 'Weekly digest' },
      ],
      default: 'daily',
    }),
  },

  resolve: (f) => {
    const digest = f.field('digest');
    return {
      recipients: f.field('recipients'),
      digest,
      ...(digest ? { digestFrequency: f.field('digestFrequency') } : {}),
      retries: retriesField(f, 'email'),
    };
  },
});
