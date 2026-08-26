import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { memo } from 'react';
import { defaultExt } from '../../generation/config.js';
import { generationForm } from '../../generation/hub.js';
import type { FormStore } from '../../core/index.js';
import { Controller, FormProvider } from '../index.js';

/**
 * Render isolation on the REAL generation form — the phase-4 upgrade of the
 * mini-fixture tests. The SD branch is the heaviest real path; these count
 * actual renders through a full recompute of ~20 fields per keystroke.
 */

const renders: Record<string, number> = {};
const count = (name: string) => {
  renders[name] = (renders[name] ?? 0) + 1;
};

const Probe = memo(function Probe({ name }: { name: string }) {
  return (
    <Controller
      name={name}
      render={({ value }) => {
        count(name);
        return (
          <input
            aria-label={name}
            value={typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}
            readOnly
          />
        );
      }}
    />
  );
});

const PROBED = ['prompt', 'steps', 'cfgScale', 'sampler', 'model', 'ecosystem', 'quantity'];

function setup(defaults?: Record<string, unknown>) {
  for (const key of Object.keys(renders)) delete renders[key];
  const store = generationForm.createStore({ ext: defaultExt, defaults });
  render(
    <FormProvider store={store as FormStore<unknown, unknown>}>
      {PROBED.map((name) => (
        <Probe key={name} name={name} />
      ))}
    </FormProvider>
  );
  return store;
}

describe('render isolation on the real generation form (SD branch)', () => {
  it('a prompt keystroke re-renders only the prompt control', () => {
    const store = setup({ ecosystem: 'SD1' });
    const before = { ...renders };

    act(() => store.set({ prompt: 'a cat' }));

    expect(renders.prompt).toBe(before.prompt! + 1);
    for (const key of ['steps', 'cfgScale', 'sampler', 'model', 'ecosystem', 'quantity']) {
      expect(renders[key]).toBe(before[key]);
    }
  });

  it('a typing burst leaves every other control untouched', () => {
    const store = setup({ ecosystem: 'SD1' });
    const before = { ...renders };

    act(() => {
      for (const text of ['a', 'a c', 'a ca', 'a cat', 'a cat s', 'a cat sitting']) {
        store.set({ prompt: text });
      }
    });

    for (const key of ['steps', 'cfgScale', 'sampler', 'model', 'ecosystem', 'quantity']) {
      expect(renders[key]).toBe(before[key]);
    }
    expect(screen.getByLabelText('prompt')).toHaveProperty('value', 'a cat sitting');
  });

  it('an ecosystem switch re-renders exactly the fields whose data moved', () => {
    const store = setup({ ecosystem: 'SD1' });
    act(() => store.set({ prompt: 'a cat' })); // settle
    const before = { ...renders };

    act(() => store.set({ ecosystem: 'Flux1' }));

    // Changed: ecosystem, model (different default), sampler (left the branch),
    // steps/cfg (different flux codecs+defaults).
    expect(renders.ecosystem).toBe(before.ecosystem! + 1);
    expect(screen.queryByLabelText('sampler')).toBeNull(); // unmounted
    // Unchanged: prompt survives the branch switch without re-rendering.
    expect(renders.prompt).toBe(before.prompt);
    expect(renders.quantity).toBe(before.quantity);
  });

  it('an ext change re-renders nothing when no field consumes the delta', () => {
    const store = setup({ ecosystem: 'SD1' });
    const before = { ...renders };

    act(() =>
      store.setExt({ ...defaultExt, user: { ...defaultExt.user, tier: 'silver' } })
    );

    expect(renders).toEqual(before);
  });
});
