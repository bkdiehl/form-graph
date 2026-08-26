import { describe, expect, it } from 'vitest';
import { defaultExt, miniForm } from '../../__fixtures__/mini-generation.js';

/**
 * These are the tests behind the central performance claim: a full recompute
 * produces all-new objects, and the diff hands back the previous reference for
 * every field that did not actually change. Without that, every keystroke would
 * re-render every control.
 */
describe('snapshot diffing', () => {
  it('preserves field references across an unrelated change', () => {
    const store = miniForm.createStore({ ext: defaultExt });
    const before = { steps: store.getField('steps'), aspectRatio: store.getField('aspectRatio') };

    store.set({ prompt: 'a cat' });

    expect(store.getField('steps')).toBe(before.steps);
    expect(store.getField('aspectRatio')).toBe(before.aspectRatio);
  });

  it('produces a new reference only for the field that changed', () => {
    const store = miniForm.createStore({ ext: defaultExt });
    const beforePrompt = store.getField('prompt');

    store.set({ prompt: 'a cat' });

    expect(store.getField('prompt')).not.toBe(beforePrompt);
  });

  it('canonicalises rebuilt-but-equal meta back to the previous object', () => {
    const store = miniForm.createStore({ ext: defaultExt });
    const before = store.getField('resources');

    // Resolution rebuilds `{ limit: 3 }` and slices a fresh array every pass.
    store.set({ prompt: 'a cat' });

    expect(store.getField('resources')).toBe(before);
  });

  it('keeps the whole snapshot when nothing changed', () => {
    const store = miniForm.createStore({ ext: defaultExt });
    const before = store.getSnapshot();

    store.set({ prompt: '' }); // already the default

    expect(store.getSnapshot()).toBe(before);
    expect(store.getSnapshot().state).toBe(before.state);
  });

  it('preserves the active-key array while the branch is unchanged', () => {
    const store = miniForm.createStore({ ext: defaultExt });
    const before = store.getSnapshot().keys;

    store.set({ prompt: 'a cat' });
    store.set({ steps: 30 });

    // A consumer rendering the field list must not re-render on every keystroke.
    expect(store.getSnapshot().keys).toBe(before);
  });

  it('gives a new key array when the branch changes the active set', () => {
    const store = miniForm.createStore({ ext: defaultExt });
    const before = store.getSnapshot().keys;

    store.set({ workflow: 'image:upscale' });

    expect(store.getSnapshot().keys).not.toBe(before);
    expect(store.getSnapshot().keys).toContain('upscaler');
  });

  it('reports fields that left the active branch as changed', () => {
    const store = miniForm.createStore({ ext: defaultExt });
    let notifications = 0;
    store.subscribe('steps', () => notifications++);

    store.set({ workflow: 'image:upscale' });

    expect(store.getField('steps')).toBeNull();
    expect(notifications).toBe(1);
  });
});
