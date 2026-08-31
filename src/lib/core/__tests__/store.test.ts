import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultExt, miniForm, type MiniExt } from '../../__fixtures__/mini-generation.js';
import type { StorageAdapter } from '../index.js';
import { defineForm } from '../form.js';
import { type Fields } from '../resolve.js';
import { defineGraph } from '../graph.js';
import { enumOf } from '../def-helpers.js';

const createStore = (opts: Partial<{ defaults: Record<string, unknown>; ext: MiniExt; storage: StorageAdapter }> = {}) =>
  miniForm.createStore({ ext: opts.ext ?? defaultExt, defaults: opts.defaults, storage: opts.storage });

describe('store: set', () => {
  it('writes a value and notifies only that field', () => {
    const store = createStore();
    const onSteps = vi.fn();
    const onPrompt = vi.fn();
    store.subscribe('steps', onSteps);
    store.subscribe('prompt', onPrompt);

    store.set({ prompt: 'a cat' });

    expect(store.getField('prompt')?.value).toBe('a cat');
    expect(onPrompt).toHaveBeenCalledTimes(1);
    expect(onSteps).not.toHaveBeenCalled();
  });

  it('applies opt-in coercion on trusted writes', () => {
    const store = createStore();
    // cfgScale snaps to 0.5 steps
    store.set({ ecosystem: 'SD' });
    store.set({ cfgScale: 7.3 });

    expect(store.getField('cfgScale')?.value).toBe(7.5);
  });

  it('clears back to the default when set to undefined', () => {
    const store = createStore();
    store.set({ steps: 40 });
    expect(store.getField('steps')?.value).toBe(40);

    store.set({ steps: undefined });
    expect(store.getField('steps')?.value).toBe(25);
  });

  it('does not notify when a write changes nothing', () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set({ prompt: '' }); // already the default

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('store: branch memory', () => {
  it('restores prior values when returning to a branch', () => {
    const store = createStore();

    store.set({ steps: 42 });
    expect(store.getField('steps')?.value).toBe(42);

    // Leave the Flux branch entirely — `steps` is not part of the upscale branch.
    store.set({ workflow: 'image:upscale' });
    expect(store.getField('steps')).toBeNull();
    expect(store.getField('scale')?.value).toBe(2);

    store.set({ workflow: 'image:create' });
    expect(store.getField('steps')?.value).toBe(42);
  });

  it('keeps intent for fields that are not currently active', () => {
    const store = createStore();
    store.set({ steps: 42 });
    store.set({ workflow: 'image:upscale' });

    expect(store.getIntent().steps).toBe(42);
  });

  it('survives an ecosystem round trip', () => {
    const store = createStore();
    store.set({ steps: 33, aspectRatio: '16:9' });
    store.set({ ecosystem: 'SD' });
    store.set({ ecosystem: 'Flux' });

    expect(store.getField('steps')?.value).toBe(33);
    expect(store.getField('aspectRatio')?.value).toBe('16:9');
  });
});

describe('store: reconciler', () => {
  it('couples workflow -> model in one pass', () => {
    const store = createStore();
    store.set({ workflow: 'image:draft' });

    expect(store.getState()).toMatchObject({ workflow: 'image:draft', model: 'flux-draft' });
  });

  it('couples model -> workflow in the other direction', () => {
    const store = createStore();
    store.set({ model: 'flux-draft' });

    expect(store.getState()).toMatchObject({ workflow: 'image:draft', model: 'flux-draft' });
  });

  it('settles without looping when leaving the coupled state', () => {
    const store = createStore();
    store.set({ model: 'flux-draft' });
    store.set({ model: 'flux-standard' });

    expect(store.getState()).toMatchObject({ workflow: 'image:create', model: 'flux-standard' });
  });

  it('c.next gives the effective PAIR when both triggers land in one patch', () => {
    const retargets: string[] = [];
    const graph = defineGraph()
      .field(
        'workflow',
        enumOf({
          options: [
            { value: 'txt2vid', label: 't' },
            { value: 'img2vid', label: 'i' },
          ],
          default: 'txt2vid',
        })
      )
      .field(
        'resolution',
        enumOf({
          options: [
            { value: '480p', label: 'l' },
            { value: '720p', label: 'h' },
          ],
          default: '480p',
        })
      )
      .field(
        'target',
        enumOf({
          options: [
            { value: 'none', label: 'n' },
            { value: 'i2v_480p', label: 'a' },
            { value: 'i2v_720p', label: 'b' },
          ],
          default: 'none',
        })
      )
      .effect({
        // Both triggers delegate; each firing reads the EFFECTIVE pair from
        // next, so a single set() carrying both keys retargets coherently.
        workflow: (_v, c) => retarget(c.next),
        resolution: (_v, c) => retarget(c.next),
      });
    function retarget(next: { workflow?: string; resolution?: string }) {
      const target = next.workflow === 'img2vid' ? `i2v_${next.resolution}` : 'none';
      retargets.push(target);
      return { target };
    }
    const form = defineForm({
      defs: graph.defs,
      reconcile: [...graph.effects],
      resolve: (f: Fields) => graph.resolve(f),
    });
    const store = form.createStore();
    store.set({ workflow: 'img2vid', resolution: '720p' });
    expect(store.getState()).toMatchObject({ target: 'i2v_720p' });
    // fired once per trigger, both firings saw the same effective pair
    expect(retargets).toEqual(['i2v_720p', 'i2v_720p']);
  });

  it('the CALLBACK form: one effect spanning keys, no trigger map', () => {
    const graph = defineGraph()
      .field(
        'workflow',
        enumOf({
          options: [
            { value: 'txt2vid', label: 't' },
            { value: 'img2vid', label: 'i' },
          ],
          default: 'txt2vid',
        })
      )
      .field(
        'resolution',
        enumOf({
          options: [
            { value: '480p', label: 'l' },
            { value: '720p', label: 'h' },
          ],
          default: '480p',
        })
      )
      .field(
        'target',
        enumOf({
          options: [
            { value: 'none', label: 'n' },
            { value: 'i2v_480p', label: 'a' },
            { value: 'i2v_720p', label: 'b' },
          ],
          default: 'none',
        })
      )
      .effect(({ patch, next }) => {
        if (!('workflow' in patch) && !('resolution' in patch)) return;
        return { target: next.workflow === 'img2vid' ? `i2v_${next.resolution}` : 'none' };
      });
    const form = defineForm({
      defs: graph.defs,
      reconcile: [...graph.effects],
      resolve: (f: Fields) => graph.resolve(f),
    });
    const store = form.createStore();
    store.set({ workflow: 'img2vid', resolution: '720p' });
    expect(store.getState()).toMatchObject({ target: 'i2v_720p' });
    store.set({ target: 'none' });
    // an unrelated edit passes through the callback untouched
    expect(store.getState()).toMatchObject({ target: 'none', workflow: 'img2vid' });
  });
});

describe('store: ext', () => {
  it('re-resolves when external context changes', () => {
    const store = createStore();
    store.set({ resources: ['a', 'b', 'c'] });
    expect(store.getField('resources')?.meta).toEqual({ limit: 3 });

    store.setExt({ ...defaultExt, limits: { maxResources: 1 } });

    expect(store.getField('resources')?.meta).toEqual({ limit: 1 });
    expect(store.getField('resources')?.value).toEqual(['a']);
  });

  it('keeps the full user intent when a limit later loosens', () => {
    const store = createStore();
    store.set({ resources: ['a', 'b', 'c'] });
    store.setExt({ ...defaultExt, limits: { maxResources: 1 } });
    store.setExt({ ...defaultExt, limits: { maxResources: 3 } });

    expect(store.getField('resources')?.value).toEqual(['a', 'b', 'c']);
  });
});

describe('store: reset', () => {
  it('clears intent back to defaults', () => {
    const store = createStore();
    store.set({ prompt: 'a cat', steps: 40 });
    store.reset();

    expect(store.getField('prompt')?.value).toBe('');
    expect(store.getField('steps')?.value).toBe(25);
  });

  it('preserves excluded keys, including inactive ones', () => {
    const store = createStore();
    store.set({ prompt: 'a cat', steps: 40 });
    store.set({ workflow: 'image:upscale' }); // steps is now inactive
    store.reset({ exclude: ['steps'] });

    expect(store.getIntent().steps).toBe(40);
    expect(store.getField('prompt')?.value).toBe('');
  });
});

describe('store: validate and output', () => {
  it('reports errors from the output schema and surfaces them on the field', () => {
    const store = createStore();
    const result = store.validate();

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.prompt?.message).toBe('Prompt is required');
    expect(store.getField('prompt')?.error?.message).toBe('Prompt is required');
  });

  it('clears the error once the value is fixed', () => {
    const store = createStore();
    store.validate();
    store.set({ prompt: 'a cat' });

    expect(store.getField('prompt')?.error).toBeUndefined();
    expect(store.validate().success).toBe(true);
  });

  it('output() returns only the active branch fields', () => {
    const store = createStore();
    store.set({ prompt: 'a cat', workflow: 'image:upscale' });

    const output = store.output();
    expect(output).toHaveProperty('upscaler');
    expect(output).not.toHaveProperty('ecosystem');
  });
});

describe('store: storage', () => {
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

  it('persists intent and rehydrates it through the input schemas', () => {
    const first = createStore({ storage });
    first.set({ prompt: 'a cat', steps: 40 });

    expect(saved).toMatchObject({ prompt: 'a cat', steps: 40 });

    const second = createStore({ storage });
    expect(second.getField('prompt')?.value).toBe('a cat');
    expect(second.getField('steps')?.value).toBe(40);
  });

  it('lets explicit defaults win over stored values', () => {
    saved = { prompt: 'stored' };
    const store = createStore({ storage, defaults: { prompt: 'from remix' } });

    expect(store.getField('prompt')?.value).toBe('from remix');
  });
});
