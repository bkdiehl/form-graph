import { beforeEach, describe, expect, it } from 'vitest';
import { fieldMeta, type StorageAdapter } from '../../core/index.js';
import { defaultExt, fluxVersionIds } from '../config.js';
import { generationForm } from '../hub.js';

/**
 * Closures for the server/client CONSUMPTION audits (orchestration-new.service
 * + handlers + GenerationFormProvider). Each block names the v1 touchpoint it
 * serves.
 */

const store = (defaults?: Record<string, unknown>) =>
  generationForm.createStore({ ext: defaultExt, defaults });

describe('G1: computed-key identification (validateInput computedKeys / getGenerationDisplayKeys)', () => {
  it('parse reports derived keys so the server can strip them from persisted params', () => {
    const result = generationForm.parse({ prompt: 'a cat' }, defaultExt);

    expect(result.success).toBe(true);
    if (!result.success) return;
    for (const key of ['output', 'input', 'fluxMode', 'triggerWords', 'snippetTargets']) {
      expect(result.computedKeys).toContain(key);
    }
    expect(result.computedKeys).not.toContain('prompt');
    expect(result.computedKeys).not.toContain('steps');
  });

  it('the store exposes the same list (whatIf fingerprints, snapshot cache)', () => {
    const s = store();
    expect(s.getComputedKeys()).toContain('fluxMode');
    expect(s.getComputedKeys()).not.toContain('cfgScale');
  });
});

describe('G2: substitution notes carry ids + reason, on failure too (#3520 pipeline)', () => {
  it('classifies the reason at the source', () => {
    const result = generationForm.parse(
      { workflow: 'txt2img:draft', prompt: 'a cat', model: 999999 },
      defaultExt
    );

    expect(result.notes).toContainEqual(
      expect.objectContaining({
        kind: 'model-substitution',
        detail: expect.objectContaining({
          requested: 999999,
          applied: fluxVersionIds.draft,
          reason: 'locked_default',
        }),
      })
    );
  });

  it('a parse that substituted and then FAILED still reports the substitution', () => {
    // v1: emitModelSubstitutions runs regardless of result.success.
    const result = generationForm.parse(
      { workflow: 'txt2img:draft', model: 999999 }, // no prompt -> validation fails
      defaultExt
    );

    expect(result.success).toBe(false);
    expect(result.notes).toContainEqual(
      expect.objectContaining({ kind: 'model-substitution' })
    );
  });
});

describe('G3: capability probe (workflow-capability.ts clone/init/getNodeMeta)', () => {
  it('fieldMeta answers per-(workflow, ecosystem) model capability', () => {
    const meta = fieldMeta(
      generationForm,
      'model',
      { workflow: 'txt2img', ecosystem: 'Flux1' },
      defaultExt
    ) as { modelLocked: boolean; defaultModelId?: number; versions?: unknown };

    expect(meta.modelLocked).toBe(false);
    expect(meta.defaultModelId).toBe(fluxVersionIds.standard);
    expect(meta.versions).toBeDefined();

    const locked = fieldMeta(
      generationForm,
      'model',
      { workflow: 'txt2img:draft', ecosystem: 'Flux1' },
      defaultExt
    ) as { modelLocked: boolean; defaultModelId?: number };
    expect(locked.modelLocked).toBe(true);
    expect(locked.defaultModelId).toBe(fluxVersionIds.draft);
  });
});

describe('whatIf validate-with-overrides (useWhatIfFromGraph L97-104)', () => {
  it('a pure parse of overridden visible state replaces the validate(data) overload', () => {
    const s = store(); // prompt empty -> normal validate would fail
    const result = generationForm.parse(
      { ...s.getSnapshot().state, prompt: 'cost-estimation' },
      defaultExt
    );

    expect(result.success).toBe(true);
    if (result.success && 'steps' in result.data) {
      expect(result.data.steps).toBe(25);
    }
    // and the store itself was never touched:
    expect(s.getField('prompt')?.value).toBe('');
  });
});

describe('compat-modal flow: storage-restored values after a branch-switching set (provider L738-759)', () => {
  it('set({workflow, ecosystem}) synchronously exposes the target scope\'s remembered values', () => {
    const s = store();
    // User accumulates flux-group memory...
    s.set({ steps: 42, aspectRatio: '3:2' });
    // ...moves to SD and changes things there...
    s.set({ ecosystem: 'SD1' });
    s.set({ steps: 30 });

    // The modal's onConfirm: one set, then an immediate synchronous re-read —
    // v1 needs the storage valueProvider to repopulate; here scoped intent IS
    // the memory, so the snapshot after set() already has the target values.
    s.set({ workflow: 'txt2img', ecosystem: 'Flux1' });
    expect(s.getField('steps')?.value).toBe(42);
    expect((s.getField('aspectRatio')?.value as { value: string }).value).toBe('3:2');
  });
});

describe('single-stage cross-branch set (provider L570-594, the PolyGen remix shape)', () => {
  it('one set carrying discriminators AND child keys lands the children in the new branch', () => {
    const s = store(); // starts on txt2img/Flux1
    // v1 required a two-stage set (discriminators first, then the blob),
    // because a single set dropped keys of the not-yet-active subgraph. Here
    // the pending values resolve in the SAME pass as the new discriminators.
    s.set({
      workflow: 'txt2vid',
      ecosystem: 'LTXV23',
      resolution: '1080p',
      duration: 4,
      prompt: 'a remixed video',
    });

    expect(s.getField('ecosystem')?.value).toBe('LTXV23');
    expect(s.getField('resolution')?.value).toBe('1080p');
    expect(s.getField('duration')?.value).toBe(4);
    expect(s.getField('prompt')?.value).toBe('a remixed video');
  });
});

describe('clearStorageForOutput (provider L76-114) via prune', () => {
  let saved: Record<string, unknown> = {};
  const storage: StorageAdapter = {
    load: () => saved,
    save: (intent) => {
      saved = intent;
    },
  };
  beforeEach(() => {
    saved = {};
  });

  it('prunes scoped intent by predicate and persists the result', () => {
    const s = generationForm.createStore({ ext: defaultExt, storage });
    s.set({ steps: 42 }); // steps@flux
    s.set({ prompt: 'keep me' }); // unscoped

    s.prune((address) => address.includes('@flux'));

    expect(s.getField('steps')?.value).toBe(25); // back to default
    expect(s.getField('prompt')?.value).toBe('keep me');
    expect(Object.keys(saved).some((a) => a.includes('@flux'))).toBe(false);
  });
});
