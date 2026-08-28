import { z } from 'zod';
import { codec, defineForm, defineSection } from '$lib/index.js';
import { enumCodec } from '$lib/codecs/index.js';

// One DESTINATION: a complete form in its own module. Each codec is defined
// once in the codecs slot; in the resolver, a dependency is a VARIABLE — a
// field can only reference fields declared above it, enforced by the language.
export const s3Destination = defineSection({
  key: 's3',
  label: 'S3',

  codecs: {
    bucket: codec({
      input: z.string().optional(),
      output: z.string().regex(/^[a-z0-9.-]{3,63}$/, 'Lowercase letters, digits, dots, dashes'),
      default: '',
    }),
    region: enumCodec({
      options: [
        { value: 'us-east-1', label: 'us-east-1' },
        { value: 'eu-central-1', label: 'eu-central-1' },
        { value: 'ap-northeast-1', label: 'ap-northeast-1' },
      ],
      default: 'us-east-1',
    }),
    storageClass: enumCodec({
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'glacier', label: 'Glacier' },
      ],
      default: 'standard',
    }),
  },

  resolve: (f) => {
    const region = f.field('region');
    return {
      bucket: f.field('bucket'),
      region,
      // The availability rule, once, where its condition is in scope: the
      // option renders disabled AND a value sitting on it corrects, noted.
      storageClass: f.field('storageClass', {
        constrain: { glacier: region === 'ap-northeast-1' && 'class_unavailable_in_region' },
      }),
    };
  },
});

// A destination is mountable ALONE — the fragment and the standalone form
// are the same code. The hub is one consumer of it, not its owner.
export const s3Form = defineForm({
  codecs: s3Destination.codecs,
  resolve: s3Destination.resolve,
});
