import { z } from 'zod';
import { defineGraph } from '$lib/index.js';
import { enumOf } from '$lib/defs/index.js';

// One DESTINATION: a complete graph in its own module. Each field is one
// definition; the availability rule is one gate declaration whose condition
// reads the field above it.
export const s3Graph = defineGraph()
  .field('bucket', {
    input: z.string().optional(),
    output: z.string().regex(/^[a-z0-9.-]{3,63}$/, 'Lowercase letters, digits, dots, dashes'),
    default: '',
  })
  .field('region', enumOf({
    options: [
      { value: 'us-east-1', label: 'us-east-1' },
      { value: 'eu-central-1', label: 'eu-central-1' },
      { value: 'ap-northeast-1', label: 'ap-northeast-1' },
    ],
    default: 'us-east-1',
  }))
  .field('storageClass', (c) =>
    enumOf({
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'glacier', label: 'Glacier' },
      ],
      default: 'standard',
      gate: { glacier: c.region === 'ap-northeast-1' && 'class_unavailable_in_region' },
    })
  );

export const s3Meta = { key: 's3', label: 'S3' } as const;

// A destination is mountable ALONE — the graph and the standalone form are
// the same code. The hub is one consumer of it, not its owner.
export const s3Form = s3Graph;
