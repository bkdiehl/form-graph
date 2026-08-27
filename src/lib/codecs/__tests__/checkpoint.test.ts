import { describe, expect, it } from 'vitest';
import { defineForm, type Fields } from '../../core/index.js';
import { textCodec } from '../basic.js';
import { createCheckpointKit, type CheckpointCatalog } from '../checkpoint.js';
import { createResourcesKit, type ResourceData, type ResourceValue } from '../resources.js';
import type { WorkflowVersionConfig } from '../versions.js';

/**
 * Port of createCheckpointGraph's behaviour, exercised through a mini form
 * shaped like boogu/mage-flow: two workflows, each with standard+turbo
 * checkpoints, workflow-scoped version lists, and a draft-style variant.
 */

const ids = {
  t2iStandard: 10,
  t2iTurbo: 11,
  editStandard: 20,
  editTurbo: 21,
  sdCheckpoint: 30,
  locked: 40,
} as const;

const workflowVersions: WorkflowVersionConfig = {
  txt2img: {
    defaultModelId: ids.t2iStandard,
    versions: {
      options: [
        { label: 'Standard', value: ids.t2iStandard, baseModel: 'Mini' },
        { label: 'Turbo', value: ids.t2iTurbo, baseModel: 'Mini' },
      ],
    },
  },
  'img2img:edit': {
    defaultModelId: ids.editStandard,
    versions: {
      options: [
        { label: 'Edit', value: ids.editStandard, baseModel: 'Mini' },
        { label: 'Edit Turbo', value: ids.editTurbo, baseModel: 'Mini' },
      ],
    },
  },
};

const catalog: CheckpointCatalog = {
  ecosystemKeyForBaseModel: (baseModel) =>
    ({ Mini: 'MiniEco', SD1: 'SDEco' }[baseModel]),
  ecosystemDefaults: (ecosystem) =>
    ecosystem === 'SDEco' ? { modelId: ids.sdCheckpoint } : { modelId: ids.t2iStandard },
  isWorkflowAvailable: (workflow, ecosystem) =>
    ecosystem === 'MiniEco' ? true : workflow === 'txt2img',
  workflowsForEcosystem: (ecosystem) =>
    ecosystem === 'SDEco' ? ['txt2img'] : ['txt2img', 'img2img:edit'],
  workflowVariant: (workflow) =>
    workflow === 'txt2img:draft'
      ? { variantOf: 'txt2img', excludeModelVersionIds: [ids.t2iStandard] }
      : undefined,
};

type Ext = { gatedVersionIds: number[]; maxResources: number };
const ext: Ext = { gatedVersionIds: [], maxResources: 5 };

const PROMPT = textCodec();
const compatible = (ecosystem: string, resource: ResourceValue) =>
  !resource.baseModel || catalog.ecosystemKeyForBaseModel(resource.baseModel) === ecosystem;

// One kit per ecosystem module, each closing over its own version tables — the
// field and its reconciler cannot drift apart, and `appliesTo` scopes the rule
// to the kit's branch (v1 got that from branch mount/unmount).
const miniCheckpoint = createCheckpointKit({
  catalog,
  workflowVersions,
  appliesTo: (state) => state.ecosystem === 'MiniEco',
});
const sdCheckpoint = createCheckpointKit({
  catalog,
  appliesTo: (state) => state.ecosystem === 'SDEco',
});
const resources = createResourcesKit({ isCompatible: compatible });

const form = defineForm<Ext>()({
  resolve: (f: Fields, e: Ext) => {
    const workflow = f.field('workflow', textCodec({ default: 'txt2img' }));
    const ecosystem = f.field('ecosystem', textCodec({ default: 'MiniEco' }));
    const prompt = f.field('prompt', PROMPT);

    const checkpoint = ecosystem === 'MiniEco' ? miniCheckpoint : sdCheckpoint;
    const model = checkpoint.field(f, {
      ctx: { workflow, ecosystem },
      modelLocked: workflow === 'txt2img:locked' ? true : undefined,
      gatedVersionIds: e.gatedVersionIds,
    });

    return {
      workflow,
      ecosystem,
      prompt,
      model,
      resources: resources.field(f, { ecosystem, limit: e.maxResources }),
    };
  },
  reconcile: [miniCheckpoint.reconciler, sdCheckpoint.reconciler],
});

const store = () => form.createStore({ ext });

describe('checkpointField: defaults and versions', () => {
  it('defaults to the workflow config default, falling back to ecosystem defaults', () => {
    const s = store();
    expect(s.getState().model?.id).toBe(ids.t2iStandard);

    s.set({ workflow: 'img2img:edit' });
    expect(s.getState().model?.id).toBe(ids.editStandard);
  });

  it('publishes workflow-scoped versions in meta, minus gated ids', () => {
    const s = store();
    const versionsOf = () =>
      (s.getField('model')?.meta as { versions?: { options: { value: number }[] } }).versions;

    expect(versionsOf()?.options.map((o) => o.value)).toEqual([ids.t2iStandard, ids.t2iTurbo]);

    s.setExt({ ...ext, gatedVersionIds: [ids.t2iTurbo] });
    expect(versionsOf()?.options.map((o) => o.value)).toEqual([ids.t2iStandard]);
  });

  it('moves to the index-equivalent version when the workflow changes (fast->fast)', () => {
    const s = store();
    s.set({ model: { id: ids.t2iTurbo, model: { type: 'Checkpoint' } } });

    s.set({ workflow: 'img2img:edit' });

    // v1's buildVersionMappings: turbo (index 1) maps to edit-turbo (index 1).
    expect(s.getState().model?.id).toBe(ids.editTurbo);
  });

  it('leaves an unknown (custom) checkpoint alone on workflow change', () => {
    const s = store();
    s.set({ model: { id: 999, model: { type: 'Checkpoint' } } });
    s.set({ workflow: 'img2img:edit' });

    expect(s.getState().model?.id).toBe(999);
  });
});

describe('checkpointField: locked substitution (issue #3520 shape)', () => {
  it('snaps a stale stored checkpoint back to the forced default and records a note', () => {
    const result = form.parse(
      { workflow: 'txt2img:locked', ecosystem: 'SDEco', prompt: 'a cat', model: 999 },
      ext
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.model).toMatchObject({ id: ids.sdCheckpoint });
    expect(result.notes).toContainEqual(
      expect.objectContaining({
        key: 'model',
        kind: 'locked_default',
        detail: expect.objectContaining({
          requested: 999,
          to: expect.objectContaining({ id: ids.sdCheckpoint }),
        }),
      })
    );
  });

  it('behaviour is identical whether or not the notes are read (v1 observe-only)', () => {
    const input = { workflow: 'txt2img:locked', ecosystem: 'SDEco', prompt: 'a cat', model: 999 };
    const a = form.parse(input, ext);
    const b = form.parse(input, ext);
    expect(a.success && a.data.model).toEqual(b.success && b.data.model);
  });
});

describe('checkpointReconciler: the three effects as one rule', () => {
  it("model from another ecosystem switches ecosystem when the workflow is compatible", () => {
    const s = store();
    s.set({ model: { id: ids.sdCheckpoint, baseModel: 'SD1', model: { type: 'Checkpoint' } } });

    expect(s.getState().ecosystem).toBe('SDEco');
    expect(s.getState().workflow).toBe('txt2img');
  });

  it('switches workflow too when the current one cannot run on the model ecosystem', () => {
    const s = store();
    s.set({ workflow: 'img2img:edit' });
    s.set({ model: { id: ids.sdCheckpoint, baseModel: 'SD1', model: { type: 'Checkpoint' } } });

    expect(s.getState()).toMatchObject({ ecosystem: 'SDEco', workflow: 'txt2img' });
  });

  it('a model excluded by a workflow variant falls back to the parent workflow', () => {
    const s = store();
    s.set({ workflow: 'txt2img:draft' });
    s.set({ model: { id: ids.t2iStandard, model: { type: 'Checkpoint' } } });

    expect(s.getState().workflow).toBe('txt2img');
  });

  it('a checkpoint only offered by another workflow switches to that workflow', () => {
    const s = store();
    s.set({ model: { id: ids.editTurbo, model: { type: 'Checkpoint' } } });

    expect(s.getState()).toMatchObject({ workflow: 'img2img:edit' });
    expect(s.getState().model?.id).toBe(ids.editTurbo);
  });
});

describe('resourcesField', () => {
  it('filters incompatible resources and clamps to the ext limit, by construction', () => {
    const s = store();
    const mini = (id: number): ResourceData => ({ id, baseModel: 'Mini', model: { type: 'LORA' } });
    const sd: ResourceData = { id: 99, baseModel: 'SD1', model: { type: 'LORA' } };

    s.set({ resources: [mini(1), sd, mini(2), mini(3), mini(4), mini(5), mini(6)] });

    const value = s.getState().resources;
    expect(value.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]); // sd dropped, capped at 5
  });

  it('keeps loose hydrated objects in state but strips them from output', () => {
    const s = store();
    s.set({
      prompt: 'a cat',
      resources: [
        {
          id: 1,
          baseModel: 'Mini',
          model: { type: 'LORA' },
          name: 'Hydrated Name',
          images: ['x.jpg'],
        } as unknown as ResourceData,
      ],
    });

    expect((s.getState().resources[0] as Record<string, unknown>).name).toBe('Hydrated Name');
    const output = s.output().resources as Record<string, unknown>[];
    expect(output[0]).not.toHaveProperty('name');
    expect(output[0]).not.toHaveProperty('images');
    expect(output[0]).toMatchObject({ id: 1 });
  });

  it('holds an un-hydrated stub in state but fails output validation on it', () => {
    // The Q11 contract: `{ id }` stubs (URL/remix) live in state legitimately;
    // output validation rejecting them is what prompts hydration before submit.
    const s = store();
    s.set({ prompt: 'a cat', resources: [{ id: 1 }] });

    expect(s.getState().resources[0]).toEqual({ id: 1 });
    const result = s.validate();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.resources).toBeDefined();
  });

  it('derives excludeIds meta from the resolved value', () => {
    const s = store();
    s.set({ resources: [{ id: 7, baseModel: 'Mini', model: { type: 'LORA' } }] });

    expect(s.getField('resources')?.meta).toMatchObject({
      options: { excludeIds: [7] },
      limit: 5,
    });
  });
});

describe('reconciler array composition (decided Q10)', () => {
  it('later rules see earlier rules’ corrections', () => {
    const kit = createCheckpointKit({ catalog });
    const composed = defineForm<Ext>()({
      resolve: (f: Fields) => ({
        workflow: f.field('workflow', textCodec({ default: 'txt2img' })),
        ecosystem: f.field('ecosystem', textCodec({ default: 'MiniEco' })),
        model: kit.field(f, { ctx: { workflow: 'txt2img', ecosystem: 'MiniEco' } }),
        audit: f.field('audit', textCodec()),
      }),
      reconcile: [
        kit.reconciler,
        // Runs AFTER the checkpoint rule — records what it decided.
        (patch) => ('ecosystem' in patch ? { ...patch, audit: String(patch.ecosystem) } : patch),
      ],
    });

    const s = composed.createStore({ ext });
    s.set({ model: { id: ids.sdCheckpoint, baseModel: 'SD1', model: { type: 'Checkpoint' } } });

    // The audit rule saw the ecosystem the checkpoint rule added to the patch.
    expect(s.getState().audit).toBe('SDEco');
  });
});
