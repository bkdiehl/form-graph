import { z } from 'zod';
import { codec, defineForm, type Fields } from '$lib/index.js';
import { enumCodec, numberCodec } from '$lib/codecs/index.js';

// A compact form authored right next to the page that consumes it, so the demo
// shows both ends: the resolver whose switch IS the union, and the typed
// registry the controls derive their props from.

const MODE = enumCodec({
  options: [
    { label: 'Create', value: 'create' },
    { label: 'Upscale', value: 'upscale' },
  ],
  default: 'create',
});

const PROMPT = codec({
  input: z.string().optional(),
  output: z.string().min(1, 'Prompt is required'),
  default: '',
});

const STEPS = numberCodec({ min: 1, max: 50, default: 25 });
const CFG = numberCodec({ min: 1, max: 20, step: 0.5, default: 7 });
const SCALE = numberCodec({ min: 2, max: 4, default: 2 });

const ASPECT = enumCodec({
  options: [
    { label: 'Square', value: '1:1' },
    { label: 'Portrait', value: '2:3' },
    { label: 'Landscape', value: '3:2' },
  ],
  default: '1:1',
});

export const demoForm = defineForm()({
  codecs: {
    mode: MODE,
    prompt: PROMPT,
    steps: STEPS,
    cfgScale: CFG,
    scale: SCALE,
    aspectRatio: ASPECT,
  },
  resolve: (f: Fields) => {
    const mode = f.field('mode', MODE);
    const base = { mode, prompt: f.field('prompt', PROMPT) };

    switch (mode) {
      case 'upscale':
        return { ...base, mode, scale: f.field('scale', SCALE) };
      case 'create':
        return {
          ...base,
          mode,
          steps: f.field('steps', STEPS),
          cfgScale: f.field('cfgScale', CFG),
          aspectRatio: f.field('aspectRatio', ASPECT),
        };
    }
  },
});

export type DemoState = ReturnType<typeof demoForm.resolve>['state'];
