import { z } from 'zod';
import { defineGraph } from '$lib/index.js';
import { enumOf, slider } from '$lib/defs/index.js';

// A compact form authored right next to the page that consumes it. Each field
// is one definition; conditional fields return null when their mode doesn't
// carry them; the graph's registry is what types the page's controls.

export const demoForm = defineGraph()
  .field('mode', enumOf({
    options: [
      { label: 'Create', value: 'create' },
      { label: 'Upscale', value: 'upscale' },
    ],
    default: 'create',
  }))
  .field('prompt', {
    input: z.string().optional(),
    output: z.string().min(1, 'Prompt is required'),
    default: '',
  })
  .field('scale', (c) => (c.mode === 'upscale' ? slider({ min: 2, max: 4, default: 2 }) : null))
  .field('steps', (c) => (c.mode === 'create' ? slider({ min: 1, max: 50, default: 25 }) : null))
  .field('cfgScale', (c) =>
    c.mode === 'create' ? slider({ min: 1, max: 20, step: 0.5, default: 7 }) : null
  )
  .field('aspectRatio', (c) =>
    c.mode === 'create'
      ? enumOf({
          options: [
            { label: 'Square', value: '1:1' },
            { label: 'Portrait', value: '2:3' },
            { label: 'Landscape', value: '3:2' },
          ],
          default: '1:1',
        })
      : null
  );

export type DemoState = ReturnType<typeof demoForm.resolve>;
