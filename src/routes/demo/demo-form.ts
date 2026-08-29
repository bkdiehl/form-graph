import { z } from 'zod';
import { defineForm, defineGraph, type Fields } from '$lib/index.js';
import { enumOf, slider } from '$lib/codecs/index.js';

// A compact form authored right next to the page that consumes it. Each field
// is one definition; conditional fields return null when their mode doesn't
// carry them; the graph's registry is what types the page's controls.

const graph = defineGraph()
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
  .field('scale', (ctx) => (ctx.mode === 'upscale' ? slider({ min: 2, max: 4, default: 2 }) : null))
  .field('steps', (ctx) => (ctx.mode === 'create' ? slider({ min: 1, max: 50, default: 25 }) : null))
  .field('cfgScale', (ctx) =>
    ctx.mode === 'create' ? slider({ min: 1, max: 20, step: 0.5, default: 7 }) : null
  )
  .field('aspectRatio', (ctx) =>
    ctx.mode === 'create'
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

export const demoForm = defineForm({
  codecs: graph.codecs,
  resolve: (f: Fields) => graph.resolve(f, undefined as void),
});

export type DemoState = ReturnType<typeof demoForm.resolve>['state'];
