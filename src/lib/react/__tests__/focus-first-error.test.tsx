import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { z } from 'zod';
import { defineGraph, focusFirstError, list } from '../../core/index.js';
import { Controller } from '../Controller.js';
import { ListElement } from '../list.js';

/**
 * focusFirstError (proposal-0.5 §2): after a failed validate, focus the
 * FIRST errored field in declaration order, via the `fieldProps` attribute
 * the render props carry. Scoped form limits to a step's keys; a list key
 * covers its elements. Never throws; false when nothing focusable.
 */

const required = (message: string) => ({
  input: z.string().optional(),
  output: z.string().min(1, message),
  default: '',
});

const questionGraph = defineGraph().field('prompt', required('Question required'));

const wizard = defineGraph()
  .field('title', required('Title required'))
  .field('company', required('Company required'))
  .use(list('questions', questionGraph, { min: 1, max: 3 }));

type Store = ReturnType<typeof wizard.createStore>;

function Form({ store }: { store: Store }) {
  return (
    <div>
      <Controller
        store={store}
        name="title"
        render={({ value, fieldProps }) => (
          <input aria-label="title" value={String(value)} readOnly {...fieldProps} />
        )}
      />
      <Controller
        store={store}
        name="company"
        render={({ value, fieldProps }) => (
          <input aria-label="company" value={String(value)} readOnly {...fieldProps} />
        )}
      />
      <ListElement list="questions" id="s0">
        <Controller
          store={store}
          name="prompt"
          render={({ value, fieldProps }) => (
            <input aria-label="q0" value={String(value)} readOnly {...fieldProps} />
          )}
        />
      </ListElement>
    </div>
  );
}

describe('focusFirstError', () => {
  it('focuses the first errored field in declaration order', () => {
    const store = wizard.createStore();
    const { getByLabelText } = render(<Form store={store} />);
    act(() => void store.validate());
    expect(focusFirstError(store)).toBe(true);
    expect(document.activeElement).toBe(getByLabelText('title'));
  });

  it('the scoped form skips earlier errors outside the step — and a list key covers its elements', () => {
    const store = wizard.createStore();
    const { getByLabelText } = render(<Form store={store} />);
    act(() => void store.validate(['questions']));
    expect(focusFirstError(store, ['questions'])).toBe(true);
    expect(document.activeElement).toBe(getByLabelText('q0'));
  });

  it('the scope FILTER does the skipping — earlier errors exist and are passed over', () => {
    const store = wizard.createStore();
    const { getByLabelText } = render(<Form store={store} />);
    act(() => void store.validate()); // errors EVERYWHERE — title is first in declaration order
    expect(store.getField('title')?.error).toBeDefined();
    expect(focusFirstError(store, ['questions'])).toBe(true);
    // title errored and renders first; only the scope filter can skip it
    expect(document.activeElement).toBe(getByLabelText('q0'));
  });

  it('a clean form is a false no-op', () => {
    const store = wizard.createStore();
    render(<Form store={store} />);
    store.set({ title: 't', company: 'c', 'questions[s0].prompt': 'q' });
    act(() => void store.validate());
    expect(focusFirstError(store)).toBe(false);
  });

  it('an errored key with NO rendered element does not stop the search', () => {
    const store = wizard.createStore();
    const { getByLabelText } = render(<Form store={store} />);
    act(() => void store.validate(['company', 'title']));
    // both errored; suppose title's element vanished — company should catch focus
    getByLabelText('title').removeAttribute('data-fg-field');
    expect(focusFirstError(store)).toBe(true);
    expect(document.activeElement).toBe(getByLabelText('company'));
  });
});
