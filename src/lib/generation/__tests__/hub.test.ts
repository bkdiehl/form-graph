import { describe, expect, it } from 'vitest';
import { defaultExt, fluxVersionIds, type GenerationExt } from '../config.js';
import type { ImageFamilyState, VideoFamilyState } from '../families.js';
import { generationForm, type GenerationState } from '../hub.js';

/** The phase-3 hub: routing, gates, scoped ecosystem memory, computeds. */

const store = (defaults?: Record<string, unknown>, ext: GenerationExt = defaultExt) =>
  generationForm.createStore({ ext, defaults });

// --- type-level: the union narrows on real branches -------------------------
type Assert<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;
type Flux = Extract<GenerationState, { ecosystem: 'Flux1' }>;
type Upscale = Extract<GenerationState, { workflow: 'img2img:upscale' }>;
type _FluxHasMode = Assert<Extends<Flux['fluxMode'], string>>;
type _UpscaleHasScale = Assert<Extends<Upscale['scaleFactor'], number>>;
type _UpscaleNoEcosystem = Assert<Extends<'ecosystem' extends keyof Upscale ? true : false, false>>;

// Family aliases: what handlers/components import — Extract<> over the family
// union stays bounded no matter how many ecosystems the whole form grows.
type FamilyFlux = Extract<ImageFamilyState, { ecosystem: 'Flux1' }>;
type FamilyWan = Extract<VideoFamilyState, { ecosystem: 'WanV21_480p' }>;
type _FamilyFluxNarrows = Assert<Extends<FamilyFlux['fluxMode'], string>>;
type _FamilyWanNarrows = Assert<Extends<FamilyWan['resolution'], string>>;
type _VideoFamilyHasNoFlux = Assert<
  Extends<Extract<VideoFamilyState, { ecosystem: 'Flux1' }>, never>
>;

describe('hub: routing and computeds', () => {
  it('defaults to txt2img on Flux with image output', () => {
    const s = store();
    expect(s.getState()).toMatchObject({
      workflow: 'txt2img',
      output: 'image',
      input: 'text',
      ecosystem: 'Flux1',
      fluxMode: 'standard',
    });
  });

  it('routes the non-ecosystem workflow to the upscale branch', () => {
    const s = store({ workflow: 'img2img:upscale' });
    expect(s.getField('ecosystem')).toBeNull();
    expect(s.getField('upscaler')).not.toBeNull();
    expect(s.getField('scaleFactor')?.value).toBe(2);
  });

  it('migrates old workflow keys at the boundary', () => {
    const s = store({ workflow: 'image:draft' });
    expect(s.getState().workflow).toBe('txt2img:draft');
  });

  it('caps video quantity by the tier vidQuantity, image by maxQuantity', () => {
    const s = store({ workflow: 'txt2vid' });
    expect(s.getField('quantity')?.meta).toMatchObject({ max: 1 });

    s.set({ workflow: 'txt2img' });
    expect(s.getField('quantity')?.meta).toMatchObject({ max: 4 });
  });

  it('drops outputFormat for video workflows', () => {
    const s = store({ workflow: 'txt2vid' });
    expect(s.getField('outputFormat')).toBeNull();
    s.set({ workflow: 'txt2img' });
    expect(s.getField('outputFormat')).not.toBeNull();
  });
});

describe('hub: workflow<->ecosystem coupling (ecosystem-graph effects as rules)', () => {
  it('remembers the ecosystem PER WORKFLOW (scoped intent)', () => {
    const s = store();
    s.set({ ecosystem: 'SDXL' });
    s.set({ workflow: 'txt2vid' });
    expect(s.getField('ecosystem')?.value).toBe('LTXV2'); // txt2vid default

    s.set({ workflow: 'txt2img' });
    expect(s.getField('ecosystem')?.value).toBe('SDXL'); // txt2img remembered SDXL
  });

  it('moves an incompatible ecosystem to the new workflow default', () => {
    const s = store();
    s.set({ ecosystem: 'NanoBanana' });
    s.set({ workflow: 'txt2vid' }); // NanoBanana can't do video

    expect(s.getState()).toMatchObject({ workflow: 'txt2vid', ecosystem: 'LTXV2' });
  });

  it('moves an incompatible workflow when the ecosystem changes', () => {
    const s = store({ workflow: 'txt2vid' });
    s.set({ ecosystem: 'NanoBanana' });

    expect(s.getState()).toMatchObject({ ecosystem: 'NanoBanana', workflow: 'txt2img' });
  });
});

describe('hub: gates', () => {
  const gatedExt: GenerationExt = {
    ...defaultExt,
    gateRules: [
      {
        id: 'r1',
        name: '',
        availableTo: 'moderators',
        presentation: 'hidden',
        ecosystems: [],
        workflows: ['txt2vid'],
        modelVersionIds: [],
      },
      {
        id: 'r2',
        name: '',
        availableTo: 'members',
        presentation: 'disabled',
        message: 'Members only',
        ecosystems: [],
        workflows: ['txt2img:draft'],
        modelVersionIds: [],
      },
    ],
  };

  it('hides hidden workflows from options and badges disabled ones', () => {
    const s = store(undefined, gatedExt);
    const meta = s.getField('workflow')?.meta as {
      options: { value: string }[];
      gateStates: { key: string; state: string; message?: string }[];
    };

    expect(meta.options.map((o) => o.value)).not.toContain('txt2vid');
    expect(meta.gateStates).toContainEqual(
      expect.objectContaining({ key: 'txt2img:draft', state: 'memberOnly', message: 'Members only' })
    );
  });

  it('rejects a gated workflow on submit — the server-side backstop', () => {
    const result = generationForm.parse(
      { workflow: 'txt2vid', prompt: 'a cat' },
      gatedExt
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.workflow?.message).toBe('Workflow is currently unavailable');
    }
  });

  it('allows the same workflow when no rule gates it', () => {
    const result = generationForm.parse({ workflow: 'txt2vid', prompt: 'a cat' }, defaultExt);
    expect(result.success).toBe(true);
  });
});

describe('flux branch', () => {
  it('draft workflow forces the draft model and back (the v1 effect pair)', () => {
    const s = store();
    s.set({ workflow: 'txt2img:draft' });
    expect(s.getState()).toMatchObject({ fluxMode: 'draft' });
    expect(s.getField('cfgScale')).toBeNull(); // draft branch has no cfg

    s.set({ workflow: 'txt2img' });
    expect(s.getState()).toMatchObject({ fluxMode: 'standard' });
  });

  it('selecting the ultra version switches mode and aspect ratio options', () => {
    const s = store();
    s.set({ model: { id: fluxVersionIds.ultra, model: { type: 'Checkpoint' } } });

    expect(s.getState()).toMatchObject({ fluxMode: 'ultra' });
    const meta = s.getField('aspectRatio')?.meta as { options: { width: number }[] };
    expect(meta.options[0]?.width).toBeGreaterThan(2000);
    expect(s.getField('resources')).toBeNull(); // ultra has no resources
  });

  it('controlNets exist only on txt2img', () => {
    expect(store().getField('controlNets')).not.toBeNull();
    const draft = store({ workflow: 'txt2img:draft' });
    expect(draft.getField('controlNets')).toBeNull();
  });
});

describe('sd branch', () => {
  it('has the sd-only fields and grouped scope memory across SD1/SDXL', () => {
    const s = store({ ecosystem: 'SD1' });
    expect(s.getField('sampler')).not.toBeNull();
    expect(s.getField('clipSkip')).not.toBeNull();
    expect(s.getField('negativePrompt')).not.toBeNull();

    s.set({ steps: 40 });
    s.set({ ecosystem: 'SDXL' }); // same group — steps shared
    expect(s.getField('steps')?.value).toBe(40);

    s.set({ ecosystem: 'Flux1' }); // different group — flux's own default
    expect(s.getField('steps')?.value).toBe(25);
  });
});

describe('ltx branch', () => {
  it('v23 aspect ratio options and duration cap follow the resolution', () => {
    const s = store({ workflow: 'txt2vid', ecosystem: 'LTXV23' });
    expect(s.getField('ecosystem')?.value).toBe('LTXV23');

    s.set({ resolution: '1080p', duration: 10 });
    expect(s.getField('duration')?.value).toBe(6); // 1080p caps at 6s
    const meta = s.getField('aspectRatio')?.meta as { options: { width: number }[] };
    expect(meta.options[0]?.width).toBe(1920);
  });

  it('v2 has no resolution picker; img2vid gets first/last frame slots', () => {
    const s = store({ workflow: 'txt2vid', ecosystem: 'LTXV2' });
    expect(s.getField('resolution')).toBeNull();

    s.set({ workflow: 'img2vid' });
    const meta = s.getField('images')?.meta as { slots?: { label: string }[]; min: number };
    expect(meta.slots?.map((slot) => slot.label)).toEqual(['First Frame', 'Last Frame']);
    expect(meta.min).toBe(1); // only First Frame is required
  });
});

describe('snippets targets (the convergence loop as a computed)', () => {
  it('lists the editors the active branch declares', () => {
    expect(store().getField('snippetTargets')?.value).toEqual(['prompt']); // flux: no negative
    expect(store({ ecosystem: 'SD1' }).getField('snippetTargets')?.value).toEqual([
      'prompt',
      'negativePrompt',
    ]);
  });

  it('keeps loaded packs across ecosystem switches (global storage)', () => {
    const s = store();
    s.set({ snippets: { sets: [{ id: 1, name: 'pack' }], mode: 'sequential' } });
    s.set({ ecosystem: 'SD1' });
    expect((s.getField('snippets')?.value as { sets: unknown[] }).sets).toHaveLength(1);
  });
});

describe('upscale branch', () => {
  it('scale factor options derive from the uploaded image and clamp to fit', () => {
    const s = store({ workflow: 'img2img:upscale' });
    s.set({ images: [{ url: 'https://x/a.png', width: 1600, height: 900 }] });

    const meta = s.getField('scaleFactor')?.meta as { options: { value: number; disabled: boolean }[] };
    // 1600 * 3 = 4800 > 4096 — x3 and x4 disabled
    expect(meta.options.map((o) => o.disabled)).toEqual([false, true, true]);

    s.set({ scaleFactor: 4 });
    expect(s.getField('scaleFactor')?.value).toBe(2); // projected to largest valid
  });

  it('requires an image on submit', () => {
    const result = generationForm.parse({ workflow: 'img2img:upscale' }, defaultExt);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.images?.message).toBe('An image is required');
  });
});

describe('client/server parity on the real form', () => {
  // NOTE: getIntent() is the PERSISTENCE format (scoped addresses like
  // `steps@flux`) and is not a parse payload. The server parses what clients
  // submit — flat key/value state — so parity is stated over that.
  it('parsing the visible state reproduces store.output()', () => {
    const s = store();
    s.set({ prompt: 'a cat', steps: 30, aspectRatio: '16:9' });

    const server = generationForm.parse({ ...s.getState() }, defaultExt);
    expect(server.success).toBe(true);
    if (server.success) expect(server.data).toEqual(s.output());
  });

  it('the submission payload round-trips through parse unchanged', () => {
    const s = store();
    s.set({ prompt: 'a cat', steps: 30 });

    const payload = s.output();
    const server = generationForm.parse(payload, defaultExt);
    expect(server.success).toBe(true);
    if (server.success) expect(server.data).toEqual(payload);
  });
});
