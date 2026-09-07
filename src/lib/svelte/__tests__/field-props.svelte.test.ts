import { describe, expect, it } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import Field from '../Field.svelte';
import { defaultExt, miniForm } from '../../__fixtures__/mini-generation.js';

/**
 * <Field>'s THIRD snippet argument — fieldProps — carries the field's
 * `data-fg-field` attribute for focusFirstError. Mounted for real: a wrong
 * attribute name or key here would otherwise stay green forever (the react
 * suite only covers Controller's fieldProps).
 */
describe('svelte <Field>: the fieldProps snippet argument', () => {
  it('hands the snippet a spreadable data-fg-field carrying the field key', () => {
    const store = miniForm.createStore({ ext: defaultExt });
    const target = document.createElement('div');
    document.body.appendChild(target);

    const children = createRawSnippet<[unknown, unknown, { 'data-fg-field': string }]>(
      (_snap, _setValue, fieldProps) => ({
        render: () => `<input data-fg-field="${fieldProps()['data-fg-field']}" />`,
      })
    );

    const app = mount(Field, {
      target,
      props: { store, name: 'prompt', children } as never,
    });
    flushSync();

    expect(target.querySelector('input')?.getAttribute('data-fg-field')).toBe('prompt');

    unmount(app);
    target.remove();
  });
});
