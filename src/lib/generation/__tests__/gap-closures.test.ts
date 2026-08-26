import { describe, expect, it } from 'vitest';
import { defaultExt, type GenerationExt } from '../config.js';
import { experimentalDismissId } from '../gates.js';
import { generationForm } from '../hub.js';

/** The five mechanisms the complexity audit found unexercised, now pinned. */

const store = (defaults?: Record<string, unknown>, ext: GenerationExt = defaultExt) =>
  generationForm.createStore({ ext, defaults });

describe('gap 1: triggerWords — cross-field derivation into another field META', () => {
  it('collects trained words from the checkpoint and resources into prompt meta', () => {
    const s = store({ ecosystem: 'SD1' });
    s.set({
      model: { id: 128713, model: { type: 'Checkpoint' }, trainedWords: ['analog style'] },
      resources: [
        { id: 7, baseModel: 'SD 1.5', model: { type: 'LORA' }, trainedWords: ['neonpunk', 'analog style'] },
      ],
    });

    expect(s.getField('prompt')?.meta).toMatchObject({
      triggerWords: ['analog style', 'neonpunk'], // deduped
    });
    expect(s.getField('triggerWords')?.value).toEqual(['analog style', 'neonpunk']);
  });

  it('prompt meta updates when a resource with words is removed', () => {
    const s = store({ ecosystem: 'SD1' });
    s.set({
      resources: [{ id: 7, baseModel: 'SD 1.5', model: { type: 'LORA' }, trainedWords: ['neonpunk'] }],
    });
    expect(s.getField('prompt')?.meta).toMatchObject({ triggerWords: ['neonpunk'] });

    s.set({ resources: [] });
    expect(s.getField('prompt')?.meta).toMatchObject({ triggerWords: [] });
  });
});

describe('gap 2: wan — intra-leaf ecosystem switching behind a resolution picker', () => {
  const wan = () => store({ workflow: 'txt2vid', ecosystem: 'WanV21_480p' });

  it('picking a resolution switches the ECOSYSTEM, and the locked model follows', () => {
    const s = wan();
    expect(s.getField('model')?.value).toMatchObject({ id: 4800001 });

    s.set({ resolution: '720p' });

    expect(s.getField('ecosystem')?.value).toBe('WanV21_720p');
    expect(s.getField('resolution')?.value).toBe('720p');
    expect(s.getField('model')?.value).toMatchObject({ id: 7200001 }); // locked default snapped
  });

  it('the reverse direction is derivation: setting ecosystem updates the picker', () => {
    const s = wan();
    s.set({ ecosystem: 'WanV21_720p' });
    expect(s.getField('resolution')?.value).toBe('720p');
  });

  it('cannot fight: a stale stored resolution is projected to match the ecosystem', () => {
    const s = store(
      { workflow: 'txt2vid', ecosystem: 'WanV21_720p', resolution: '480p' } // contradictory input
    );
    // The ecosystem is authoritative; boundary defaults commit through the rule
    // pipeline only for set(), so projection settles the contradiction.
    expect(s.getField('resolution')?.value).toBe('720p');
  });

  it('the wan rule leaves other ecosystems alone', () => {
    const s = store({ workflow: 'txt2vid', ecosystem: 'LTXV23' });
    s.set({ resolution: '1080p' });
    expect(s.getField('ecosystem')?.value).toBe('LTXV23'); // ltx resolution is a plain field
  });
});

describe('gap 3: ecosystem-level gates + self-hosted folding', () => {
  const gatedExt: GenerationExt = {
    ...defaultExt,
    gateRules: [
      {
        id: 'hide-sdxl',
        name: '',
        availableTo: 'moderators',
        presentation: 'hidden',
        ecosystems: ['SDXL'],
        workflows: [],
        modelVersionIds: [],
      },
    ],
    selfHostedDisabledEcosystems: ['Flux1'],
    selfHostedMode: 'memberOnly',
  };

  it('hides rule-hidden ecosystems and badges self-hosted ones as memberOnly', () => {
    const s = store(undefined, gatedExt);
    const meta = s.getField('ecosystem')?.meta as {
      options: { value: string }[];
      gateStates: { key: string; state: string }[];
    };

    expect(meta.options.map((o) => o.value)).not.toContain('SDXL');
    expect(meta.gateStates).toContainEqual(
      expect.objectContaining({ key: 'Flux1', state: 'memberOnly' })
    );
  });

  it('rejects a gated ecosystem on submit — hidden AND shown-but-disabled', () => {
    for (const ecosystem of ['SDXL', 'Flux1']) {
      const result = generationForm.parse({ prompt: 'a cat', ecosystem }, gatedExt);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.ecosystem?.message).toBe('Ecosystem is currently unavailable');
      }
    }
  });

  it('publishes experimental annotations with stable dismiss ids', () => {
    const experimentalExt: GenerationExt = {
      ...defaultExt,
      gateRules: [
        {
          id: 'exp',
          name: '',
          availableTo: 'nobody',
          presentation: 'experimental',
          message: 'Local weights.',
          ecosystems: ['SD1'],
          workflows: [],
          modelVersionIds: [],
        },
      ],
    };
    const s = store(undefined, experimentalExt);
    const meta = s.getField('ecosystem')?.meta as {
      experimental: { key: string; message?: string; dismissId: string }[];
    };

    expect(meta.experimental).toContainEqual(
      expect.objectContaining({ key: 'SD1', message: 'Local weights.' })
    );
    // The property the design rests on: an edited warning re-notifies.
    const a = experimentalDismissId({ kind: 'ecosystem', key: 'SD1' }, 'Local weights.');
    const b = experimentalDismissId({ kind: 'ecosystem', key: 'SD1' }, 'Local weights, updated.');
    expect(meta.experimental[0]?.dismissId).toBe(a);
    expect(a).not.toBe(b);
  });

  it('experimental ecosystems stay selectable (annotation, not a gate)', () => {
    const experimentalExt: GenerationExt = {
      ...defaultExt,
      gateRules: [
        {
          id: 'exp',
          name: '',
          availableTo: 'nobody',
          presentation: 'experimental',
          ecosystems: ['SD1'],
          workflows: [],
          modelVersionIds: [],
        },
      ],
    };
    const result = generationForm.parse({ prompt: 'a cat', ecosystem: 'SD1' }, experimentalExt);
    expect(result.success).toBe(true);
  });
});

describe('gap 4: images modes that map to workflows', () => {
  it('publishes mode entries on images meta for the mode strip', () => {
    const s = store({ workflow: 'img2vid', ecosystem: 'LTXV23' });
    const meta = s.getField('images')?.meta as {
      modes?: { label: string; workflow: string }[];
      slots?: unknown[];
    };

    expect(meta.slots).toHaveLength(2);
    expect(meta.modes?.map((m) => m.workflow)).toEqual(['img2vid', 'img2vid:ref2vid']);
  });

  it('selecting a mode (setting its workflow) switches the images shape', () => {
    const s = store({ workflow: 'img2vid', ecosystem: 'LTXV23' });
    s.set({ workflow: 'img2vid:ref2vid' });

    const meta = s.getField('images')?.meta as { slots?: unknown[]; max: number; label?: string };
    expect(meta.slots).toBeUndefined();
    expect(meta.max).toBe(3);
    expect(s.getField('ecosystem')?.value).toBe('LTXV23'); // survives — ref2vid is ltx-only
  });
});

describe('gap 5: priority member-gating', () => {
  const freeExt: GenerationExt = { ...defaultExt, user: { isMember: false, tier: 'free' } };

  it('badges high priority for non-members and refuses it on submit', () => {
    const s = store(undefined, freeExt);
    const meta = s.getField('priority')?.meta as {
      options: { value: string; memberOnly?: boolean; disabled?: boolean }[];
    };
    expect(meta.options.find((o) => o.value === 'high')).toMatchObject({
      memberOnly: true,
      disabled: true,
    });

    const result = generationForm.parse({ prompt: 'a cat', priority: 'high' }, freeExt);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.priority?.message).toBe('High priority requires membership');
    }
  });

  it('members submit high priority normally', () => {
    const result = generationForm.parse({ prompt: 'a cat', priority: 'high' }, defaultExt);
    expect(result.success).toBe(true);
  });
});
