import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { memo, useRef } from 'react';
import { defaultExt, miniForm, type NumberMeta } from '../../__fixtures__/mini-generation.js';
import type { FormStore } from '../../core/index.js';
import { Controller, FormProvider } from '../index.js';

/**
 * The load-bearing claim of the whole design: the engine recomputes every field
 * on every change, and React still only re-renders the controls whose data moved.
 *
 * These tests count actual renders rather than asserting on internals.
 */

const renders: Record<string, number> = {};
const count = (name: string) => {
  renders[name] = (renders[name] ?? 0) + 1;
};

// memo() so a render can only be caused by the field's own subscription firing,
// not by the parent re-rendering.
const TextControl = memo(function TextControl({ name }: { name: string }) {
  return (
    <Controller<string, unknown>
      name={name}
      render={({ value, onChange }) => {
        count(name);
        return (
          <input
            aria-label={name}
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
          />
        );
      }}
    />
  );
});

const SliderControl = memo(function SliderControl({ name }: { name: string }) {
  return (
    <Controller<number, NumberMeta>
      name={name}
      render={({ value, meta, onChange }) => {
        count(name);
        return (
          <input
            type="range"
            aria-label={name}
            min={meta.min}
            max={meta.max}
            step={meta.step}
            value={value}
            onChange={(e) => onChange(Number(e.currentTarget.value))}
          />
        );
      }}
    />
  );
});

function Form({ store }: { store: FormStore<unknown, unknown> }) {
  const parentRenders = useRef(0);
  parentRenders.current++;
  return (
    <FormProvider store={store}>
      <span data-testid="parent-renders">{parentRenders.current}</span>
      <TextControl name="prompt" />
      <SliderControl name="steps" />
      <TextControl name="aspectRatio" />
      <TextControl name="model" />
    </FormProvider>
  );
}

function setup() {
  for (const key of Object.keys(renders)) delete renders[key];
  const store = miniForm.createStore({ ext: defaultExt });
  const utils = render(<Form store={store as FormStore<unknown, unknown>} />);
  return { store, ...utils };
}

describe('render isolation', () => {
  it('renders each control once on mount', () => {
    setup();
    expect(renders).toEqual({ prompt: 1, steps: 1, aspectRatio: 1, model: 1 });
  });

  it('re-renders only the edited control, despite a full recompute', () => {
    const { store } = setup();

    act(() => store.set({ prompt: 'a cat' }));

    expect(renders.prompt).toBe(2);
    expect(renders.steps).toBe(1);
    expect(renders.aspectRatio).toBe(1);
    expect(renders.model).toBe(1);
  });

  it('stays isolated across a burst of keystrokes', () => {
    const { store } = setup();

    act(() => {
      for (const text of ['a', 'a ', 'a c', 'a ca', 'a cat']) store.set({ prompt: text });
    });

    // React batches inside one act(), so the exact count is not the point —
    // the point is that untouched controls never render again.
    expect(renders.steps).toBe(1);
    expect(renders.aspectRatio).toBe(1);
    expect(renders.model).toBe(1);
    expect(screen.getByLabelText('prompt')).toHaveProperty('value', 'a cat');
  });

  it('never re-renders the provider subtree', () => {
    const { store } = setup();
    const before = screen.getByTestId('parent-renders').textContent;

    act(() => store.set({ prompt: 'a cat', steps: 30 }));

    expect(screen.getByTestId('parent-renders').textContent).toBe(before);
  });

  it('re-renders the controls a reconciler touches, and only those', () => {
    const { store } = setup();

    // Setting model to draft also flips workflow, and drops `steps` from the branch.
    act(() => store.set({ model: 'flux-draft' }));

    expect(renders.model).toBe(2);
    expect(renders.aspectRatio).toBe(1); // survives the branch switch unchanged
    expect(renders.prompt).toBe(1);
  });

  it('unmounts controls whose field left the branch', () => {
    const { store } = setup();
    expect(screen.queryByLabelText('steps')).not.toBeNull();

    act(() => store.set({ workflow: 'image:upscale' }));

    expect(screen.queryByLabelText('steps')).toBeNull();
    expect(screen.queryByLabelText('prompt')).not.toBeNull();
  });

  it('re-renders only the controls whose meta actually moved when ext changes', () => {
    const { store } = setup();

    act(() => store.setExt({ ...defaultExt, tier: 'gold' }));

    // `tier` feeds nothing in this fixture, so nothing should re-render.
    expect(renders).toEqual({ prompt: 1, steps: 1, aspectRatio: 1, model: 1 });
  });
});
