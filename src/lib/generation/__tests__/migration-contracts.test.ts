import { beforeEach, describe, expect, it } from 'vitest';
import { readIntentBuckets, readIntentValue, type StorageAdapter } from '../../core/index.js';
import { defaultExt, fluxVersionIds } from '../config.js';
import { generationForm } from '../hub.js';
import { groupOf } from '../shared.js';

/**
 * The migration contracts from the consumption audit: the three provider code
 * paths that read v1's localStorage format RAW now have a supported recipe —
 * `readIntentValue`/`readIntentBuckets` over the persisted intent record —
 * and the per-scope memory those readers depend on (model per ecosystem
 * group, images per workflow) is now real in the form.
 */

let saved: Record<string, unknown> = {};
const storage: StorageAdapter = {
  load: () => saved,
  save: (intent) => {
    saved = intent;
  },
};

const store = (defaults?: Record<string, unknown>) =>
  generationForm.createStore({ ext: defaultExt, storage, defaults });

beforeEach(() => {
  saved = {};
});

describe('reader 1: last-used checkpoint per ecosystem (provider L137-154)', () => {
  it('model is remembered per ecosystem GROUP, readable without a store', () => {
    const s = store();
    s.set({ model: { id: fluxVersionIds.krea, model: { type: 'Checkpoint' } } });
    s.set({ ecosystem: 'SD1' });
    s.set({ model: { id: 128078, model: { type: 'Checkpoint' } } });

    // The recipe replacing the raw localStorage.getItem + format parse:
    const lastFlux = readIntentValue(saved, 'model', groupOf('Flux1')) as { id: number };
    const lastSd = readIntentValue(saved, 'model', groupOf('SDXL')) as { id: number };
    expect(lastFlux.id).toBe(fluxVersionIds.krea);
    expect(lastSd.id).toBe(128078); // SD1 and SDXL share the 'sd' group bucket
  });

  it('and the form itself restores it on return to the group', () => {
    const s = store();
    s.set({ model: { id: fluxVersionIds.krea, model: { type: 'Checkpoint' } } });
    s.set({ ecosystem: 'SD1' });
    s.set({ ecosystem: 'Flux1' });
    expect(s.getField('model')?.value).toMatchObject({ id: fluxVersionIds.krea });
  });
});

describe('reader 2: mount auto-correct (provider L329-397)', () => {
  it('stored intent is comparable against the resolved snapshot to DETECT corrections', () => {
    // Simulate a stale store: workflow remembers an ecosystem that can no
    // longer run it (as if config changed between sessions).
    saved = { 'ecosystem@txt2vid': 'NanoBanana', workflow: 'txt2vid' };

    const s = store();
    const storedEcosystem = readIntentValue(saved, 'ecosystem', 'txt2vid');
    const resolvedEcosystem = s.getField('ecosystem')?.value;

    // The auto-correct recipe: stored says NanoBanana, projection resolved to
    // a valid video ecosystem — the mismatch is what opens the confirm modal.
    expect(storedEcosystem).toBe('NanoBanana');
    expect(resolvedEcosystem).toBe('LTXV2');
    expect(storedEcosystem).not.toBe(resolvedEcosystem);
  });
});

describe('reader 3: append-images reads the TARGET workflow bucket (provider L622)', () => {
  it('images persist per workflow and are readable for a workflow that is not active', () => {
    const s = store({ workflow: 'img2vid', ecosystem: 'LTXV23' });
    s.set({ images: [{ url: 'https://x/frame.png', width: 512, height: 512 }] });
    s.set({ workflow: 'txt2vid' }); // images leave the branch

    // Append flow: while NOT on img2vid, read its persisted bucket.
    const bucket = readIntentValue(saved, 'images', 'img2vid') as { url: string }[];
    expect(bucket).toHaveLength(1);
    expect(bucket[0]?.url).toBe('https://x/frame.png');

    // And returning to the workflow restores them in the form.
    s.set({ workflow: 'img2vid' });
    expect(s.getField('images')?.value).toHaveLength(1);
  });

  it('readIntentBuckets enumerates every stored bucket for a key', () => {
    const s = store({ workflow: 'img2vid', ecosystem: 'LTXV23' });
    s.set({ images: [{ url: 'https://x/a.png', width: 1, height: 1 }] });
    s.set({ workflow: 'img2img:upscale' });
    s.set({ images: [{ url: 'https://x/b.png', width: 1, height: 1 }] });

    const buckets = readIntentBuckets(saved, 'images');
    expect(Object.keys(buckets).sort()).toEqual(['img2img:upscale', 'img2vid']);
  });
});
