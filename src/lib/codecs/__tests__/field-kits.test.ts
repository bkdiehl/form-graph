import { describe, expect, it } from 'vitest';
import { defineForm, type Fields } from '../../core/index.js';
import { createUpscalerKit, createVaeKit } from '../aux-resources.js';
import { textCodec } from '../basic.js';
import { createControlNetsKit } from '../controlnets.js';
import { createQuantityKit } from '../quantity.js';
import { createSamplerKit, createSchedulerKit } from '../select.js';
import type { ResourceValue } from '../resources.js';

/**
 * The phase-2 batch ported through defineFieldKit — sampler/scheduler,
 * quantity, vae/upscaler, controlNets — asserting v1's semantics per node.
 */

const sampler = createSamplerKit({ options: ['Euler a', 'DPM++ 2M Karras', 'Heun'] });
const scheduler = createSchedulerKit({ options: ['simple', 'karras'], default: 'karras' });
const quantity = createQuantityKit({});
const vae = createVaeKit({
  isCompatible: (ecosystem, v) => v.baseModel === ecosystem,
});
const upscaler = createUpscalerKit({ defaultId: 164821 });
const controlNets = createControlNetsKit({
  registry: {
    canny: { label: 'Canny', description: 'Edges', category: 'edges' },
    tile: { label: 'Tile', description: 'Tiles', category: 'detail', requiresPreprocessedImage: true },
  },
  categoryLabels: { edges: 'Edges', detail: 'Detail' },
  preprocessors: ['canny', 'canny', 'tile', 'unknown-key'],
  limit: 2,
});

type Ext = { maxQuantity: number };

const form = defineForm<Ext>()({
  resolve: (f: Fields, ext: Ext) => {
    const ecosystem = f.field('ecosystem', textCodec({ default: 'EcoA' }));
    return {
      ecosystem,
      sampler: sampler.field(f, undefined),
      scheduler: scheduler.field(f, undefined),
      quantity: quantity.field(f, { max: ext.maxQuantity }),
      vae: vae.field(f, { ecosystem }),
      upscaler: upscaler.field(f, undefined),
      controlNets: controlNets.field(f, undefined),
    };
  },
});

const ext: Ext = { maxQuantity: 4 };

describe('sampler/scheduler kits (selectNode port)', () => {
  it('defaults to the first option (sampler) or the named default (scheduler)', () => {
    const s = form.createStore({ ext });
    expect(s.getState().sampler).toBe('Euler a');
    expect(s.getState().scheduler).toBe('karras');
  });

  it('coerces an unknown value back to the default on boundary AND trusted writes', () => {
    const result = form.parse({ sampler: 'NotASampler' }, ext);
    expect(result.success && result.data.sampler).toBe('Euler a');

    const s = form.createStore({ ext });
    s.set({ sampler: 'NotASampler' });
    expect(s.getState().sampler).toBe('Euler a');
  });

  it('publishes presets on sampler meta by default', () => {
    const s = form.createStore({ ext });
    expect(s.getField('sampler')?.meta).toMatchObject({
      presets: [{ label: 'Fast', value: 'Euler a' }, { label: 'Popular', value: 'DPM++ 2M Karras' }],
    });
  });
});

describe('quantity kit (quantityNode port)', () => {
  it('clamps to the live ext max and reflects it in meta', () => {
    const s = form.createStore({ ext });
    s.set({ quantity: 10 });
    expect(s.getState().quantity).toBe(4);
    expect(s.getField('quantity')?.meta).toMatchObject({ min: 1, max: 4 });

    s.setExt({ maxQuantity: 8 });
    expect(s.getState().quantity).toBe(8); // intent kept 10; new cap applies
  });
});

describe('vae kit (createVaeGraph port)', () => {
  it('clears an incompatible VAE by construction (was an effect)', () => {
    const s = form.createStore({ ext });
    const good: ResourceValue = { id: 1, baseModel: 'EcoA', model: { type: 'VAE' } };
    const bad: ResourceValue = { id: 2, baseModel: 'EcoB', model: { type: 'VAE' } };

    s.set({ vae: good });
    expect(s.getState().vae?.id).toBe(1);

    s.set({ vae: bad });
    expect(s.getState().vae).toBeUndefined();
  });

  it('derives excludeIds from the value', () => {
    const s = form.createStore({ ext });
    s.set({ vae: { id: 1, baseModel: 'EcoA', model: { type: 'VAE' } } });
    expect(s.getField('vae')?.meta).toMatchObject({ options: { excludeIds: [1] } });
  });
});

describe('upscaler kit (upscalerNode port)', () => {
  it('defaults to the configured upscaler', () => {
    const s = form.createStore({ ext });
    expect(s.getState().upscaler).toMatchObject({ id: 164821, model: { type: 'Upscaler' } });
  });
});

describe('controlNets kit (controlNetsNode port)', () => {
  it('dedupes and drops unknown preprocessor keys, grouped by category', () => {
    const s = form.createStore({ ext });
    const meta = s.getField('controlNets')?.meta as { options: { value: string }[]; groups: { label: string }[] };

    expect(meta.options.map((o) => o.value)).toEqual(['canny', 'tile']);
    expect(meta.groups.map((g) => g.label)).toEqual(['Edges', 'Detail']);
  });

  it('normalises boundary entries: string images, defaults, forced mode', () => {
    const result = form.parse(
      {
        controlNets: [
          { preprocessor: 'canny', image: 'https://x/y.png' },
          { preprocessor: 'tile', mode: 'auto', image: { url: 'https://x/z.png' }, weight: 1.5 },
        ],
      },
      ext
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const entries = result.data.controlNets as Record<string, unknown>[];
    expect(entries[0]).toMatchObject({
      mode: 'auto',
      image: { url: 'https://x/y.png' },
      weight: 1,
      startStep: 0,
      endStep: 1,
    });
    // tile requires a preprocessed image — mode is forced regardless of input.
    expect(entries[1]).toMatchObject({ mode: 'preprocessed', weight: 1.5 });
  });

  it('drops staged rows (no image) from output without erroring', () => {
    const s = form.createStore({ ext });
    s.set({
      controlNets: [
        { preprocessor: 'canny', mode: 'auto', weight: 1, startStep: 0, endStep: 1 },
        { preprocessor: 'canny', mode: 'auto', image: { url: 'https://x/y.png' }, weight: 1, startStep: 0, endStep: 1 },
      ],
    });

    expect(s.getState().controlNets).toHaveLength(2); // both staged in state
    expect(s.output().controlNets).toHaveLength(1); // only the complete one submits
  });

  it('rejects an ecosystem-unsupported preprocessor at the boundary', () => {
    const result = form.parse(
      { controlNets: [{ preprocessor: 'depth', image: 'https://x/y.png' }] },
      ext
    );
    // Boundary leniency: invalid input falls back to the default (empty).
    expect(result.success && result.data.controlNets).toEqual([]);
  });
});
