import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { codec } from '../core/codec.js';
import { defineForm } from '../core/form.js';
import { type Fields } from '../core/resolve.js';
import { parityExt, parityForm, versionIds, type ParityExt } from '../__fixtures__/parity-generation.js';

/**
 * v1's behavioural contract, re-asserted against the new engine.
 *
 * Each block names the v1 test file it is ported from. The point is not that
 * the same code passes — it is that the same *guarantees* hold under a design
 * with no deps arrays, no effects, and no evaluation loop.
 */

const init = (values: Record<string, unknown>, ext: ParityExt = parityExt) =>
  parityForm.createStore({ ext, defaults: values });

// ===========================================================================
// mage-flow-graph.test.ts — per-workflow versions, defaults, and clamping
// ===========================================================================

describe('v1 parity: per-workflow checkpoint options (mage-flow-graph.test.ts)', () => {
  const optionsOf = (store: ReturnType<typeof init>) =>
    (store.getField('model')?.meta as { options: number[] }).options;

  it('offers the text-to-image checkpoints on txt2img', () => {
    expect(optionsOf(init({ workflow: 'txt2img' }))).toEqual([
      versionIds.txt2imgStandard,
      versionIds.txt2imgTurbo,
    ]);
  });

  it('offers the edit checkpoints on img2img:edit', () => {
    expect(optionsOf(init({ workflow: 'img2img:edit' }))).toEqual([
      versionIds.editStandard,
      versionIds.editTurbo,
    ]);
  });

  it('defaults to the standard build for each workflow', () => {
    expect(init({ workflow: 'txt2img' }).getField('model')?.value).toBe(versionIds.txt2imgStandard);
    expect(init({ workflow: 'img2img:edit' }).getField('model')?.value).toBe(
      versionIds.editStandard
    );
  });

  it('moves off a text-to-image checkpoint when switching to edit', () => {
    const store = init({ workflow: 'txt2img', model: versionIds.txt2imgTurbo });
    expect(store.getField('model')?.value).toBe(versionIds.txt2imgTurbo);

    store.set({ workflow: 'img2img:edit' });

    // A t2i checkpoint can never survive into an edit workflow.
    expect(store.getField('model')?.value).toBe(versionIds.editStandard);
  });

  it('applies turbo slider ranges only for turbo versions', () => {
    const standard = init({ workflow: 'txt2img', model: versionIds.txt2imgStandard });
    expect(standard.getField('steps')?.meta).toMatchObject({ max: 50 });
    expect(standard.getField('cfgScale')?.meta).toMatchObject({ max: 10 });

    const turbo = init({ workflow: 'txt2img', model: versionIds.txt2imgTurbo });
    expect(turbo.getField('steps')?.meta).toMatchObject({ max: 12 });
    expect(turbo.getField('cfgScale')?.meta).toMatchObject({ max: 2 });
  });

  it('clamps a stored value that exceeds the selected version range', () => {
    const store = init({ workflow: 'txt2img', model: versionIds.txt2imgStandard, steps: 40 });
    expect(store.getField('steps')?.value).toBe(40);

    store.set({ model: versionIds.txt2imgTurbo });

    expect(store.getField('steps')?.value).toBe(12);
  });

  it('restores the original value when moving back off turbo', () => {
    const store = init({ workflow: 'txt2img', model: versionIds.txt2imgStandard, steps: 40 });
    store.set({ model: versionIds.txt2imgTurbo });
    store.set({ model: versionIds.txt2imgStandard });

    // Intent kept 40; only the projection clamped it. v1 loses this — the
    // clamped value is written back into ctx.
    expect(store.getField('steps')?.value).toBe(40);
  });
});

// ===========================================================================
// seedream-graph.test.ts — conditional field + stale stored value
// ===========================================================================

describe('v1 parity: conditional toggle (seedream-graph.test.ts)', () => {
  it('hides the toggle for versions that cannot do it, shows it for those that can', () => {
    // v1 asserts this via hasNode(), which is what makes Controller render null.
    expect(init({ model: versionIds.txt2imgTurbo }).getField('resolution')).toBeNull();
    expect(init({ model: versionIds.txt2imgStandard }).getField('resolution')).not.toBeNull();
  });

  it('renders the capped dimensions even with a stale stored high value', () => {
    expect(init({ model: versionIds.txt2imgStandard }).getState().resolution).toBe('2K');

    const stale = init({ model: versionIds.txt2imgTurbo, resolution: '4K' });
    // The field does not exist for turbo, so the stored 4K cannot reach dimensions.
    expect(stale.getField('dimensions')?.value).toBe('2048x2048');
  });

  it('still honors the stored value where the version supports it', () => {
    const store = init({ model: versionIds.txt2imgStandard, resolution: '4K' });
    expect(store.getField('dimensions')?.value).toBe('4096x4096');
  });

  it('drops back to the capped value when switching to a version without the toggle', () => {
    const store = init({ model: versionIds.txt2imgStandard, resolution: '4K' });
    expect(store.getField('dimensions')?.value).toBe('4096x4096');

    store.set({ model: versionIds.txt2imgTurbo });

    expect(store.getField('dimensions')?.value).toBe('2048x2048');
  });
});

// ===========================================================================
// model-substitution.test.ts — observability without behaviour change
// ===========================================================================

describe('v1 parity: substitution observability (model-substitution.test.ts)', () => {
  it('records the substitution with its reason', () => {
    const result = parityForm.parse(
      { workflow: 'img2img:edit', prompt: 'a cat', model: versionIds.txt2imgTurbo },
      parityExt
    );

    expect(result.notes).toEqual([
      {
        key: 'model',
        kind: 'workflow-incompatible',
        detail: {
          from: versionIds.txt2imgTurbo,
          to: versionIds.editStandard,
          workflow: 'img2img:edit',
        },
      },
    ]);
  });

  it('records nothing when the requested model is valid', () => {
    const result = parityForm.parse(
      { workflow: 'img2img:edit', prompt: 'a cat', model: versionIds.editTurbo },
      parityExt
    );

    expect(result.notes).toEqual([]);
  });

  it('settles on the same model whether or not anyone reads the notes', () => {
    // v1 has to prove this because its collector is a mutable side channel on
    // ext, so attaching one could in principle change behaviour. Here notes are
    // part of the return value and cannot influence resolution — but the
    // guarantee is worth pinning anyway.
    const input = { workflow: 'img2img:edit', prompt: 'a cat', model: versionIds.txt2imgTurbo };

    const observed = parityForm.parse(input, parityExt);
    const ignored = parityForm.parse(input, parityExt);

    expect(observed.success && observed.data.model).toBe(versionIds.editStandard);
    expect(ignored.success && ignored.data.model).toBe(versionIds.editStandard);
  });

  it('cannot leak notes between parses', () => {
    parityForm.parse(
      { workflow: 'img2img:edit', prompt: 'a cat', model: versionIds.txt2imgTurbo },
      parityExt
    );
    const clean = parityForm.parse(
      { workflow: 'txt2img', prompt: 'a cat', model: versionIds.txt2imgStandard },
      parityExt
    );

    expect(clean.notes).toEqual([]);
  });
});

// ===========================================================================
// data-graph.test.ts — external-context reactivity
// ===========================================================================

describe('v1 parity: external-context deps (data-graph.test.ts)', () => {
  type Ext = { limits: { maxResources: number } };

  const resourcesCodec = codec<number[], { limit: number }>({
    output: z.array(z.number()),
    default: [],
  });

  function makeForm() {
    const counter = { runs: 0 };
    const form = defineForm<Ext>()({
      resolve: (f: Fields, ext: Ext) => {
        counter.runs++;
        let resources = f.field('resources', resourcesCodec, {
          meta: { limit: ext.limits.maxResources },
        });
        if (resources.length > ext.limits.maxResources) {
          resources = f.correct('resources', resources.slice(0, ext.limits.maxResources), 'over_limit');
        }
        return { resources };
      },
    });
    return { form, counter };
  }

  it('updates a field meta when its ext dep changes', () => {
    const { form } = makeForm();
    const store = form.createStore({ ext: { limits: { maxResources: 9 } } });

    expect(store.getField('resources')?.meta).toEqual({ limit: 9 });

    store.setExt({ limits: { maxResources: 12 } });
    expect(store.getField('resources')?.meta).toEqual({ limit: 12 });
  });

  it('does not notify subscribers when setExt receives an equal value', () => {
    const { form } = makeForm();
    const store = form.createStore({ ext: { limits: { maxResources: 9 } } });

    let notifications = 0;
    store.subscribe('resources', () => notifications++);

    // New object reference, structurally equal — nothing observable changed.
    store.setExt({ limits: { maxResources: 9 } });
    expect(notifications).toBe(0);

    store.setExt({ limits: { maxResources: 10 } });
    expect(notifications).toBe(1);
  });

  it('enforces the live ext limit on the value, not just the meta', () => {
    // v1's own test notes it cannot assert this: an over-limit array is coerced
    // back to the node default, so it is never observable downstream. Here the
    // projection runs every pass, so the clamped value IS what state holds.
    const { form } = makeForm();
    const store = form.createStore({
      ext: { limits: { maxResources: 9 } },
      defaults: { resources: [1, 2, 3, 4, 5] },
    });

    expect(store.getField('resources')?.value).toEqual([1, 2, 3, 4, 5]);

    store.setExt({ limits: { maxResources: 2 } });
    expect(store.getField('resources')?.value).toEqual([1, 2]);
  });
});
