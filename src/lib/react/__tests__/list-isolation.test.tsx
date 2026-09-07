import { describe, expect, it } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { memo } from 'react';
import { z } from 'zod';
import { defineGraph, list } from '../../core/index.js';
import { Controller } from '../Controller.js';
import { ListElement, useList } from '../list.js';

/**
 * THE list() render contract (proposal-0.4.md §1) — the feature's acceptance
 * test, not a nice-to-have:
 *
 *   | gesture              | who re-renders                                  |
 *   | edit element X field | X's subscribers only — no sibling, no shell     |
 *   | add / remove         | the shell only — no surviving element           |
 *   | reorder              | the shell only                                  |
 */

const runGraph = defineGraph().field('epochs', {
  input: z.coerce.number().optional(),
  output: z.number(),
  default: 5,
});

const training = defineGraph().use(list('runs', runGraph, { min: 2, max: 5 }));

const renders: Record<string, number> = {};
const count = (name: string) => {
  renders[name] = (renders[name] ?? 0) + 1;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Store = ReturnType<typeof training.createStore>;

// memo() so a render can only come from the row's own subscriptions, never
// from the shell re-rendering above it.
const Row = memo(function Row({ store, id }: { store: Store; id: string }) {
  return (
    <ListElement list="runs" id={id}>
      <Controller
        store={store}
        name="epochs"
        render={({ value, onChange }) => {
          count(`row:${id}`);
          return (
            <input
              aria-label={`epochs-${id}`}
              value={String(value)}
              onChange={(e) => onChange(Number(e.target.value))}
            />
          );
        }}
      />
    </ListElement>
  );
});

function Shell({ store }: { store: Store }) {
  const runs = useList('runs', store);
  count('shell');
  if (!runs) return null;
  return (
    <div>
      {runs.ids.map((id) => (
        <Row key={id} store={store} id={id} />
      ))}
    </div>
  );
}

describe('list(): the render-isolation contract', () => {
  it('holds for element edits, add, remove, and reorder', () => {
    for (const key of Object.keys(renders)) delete renders[key];
    const store = training.createStore();
    render(<Shell store={store} />);
    expect(renders).toEqual({ shell: 1, 'row:s0': 1, 'row:s1': 1 });

    // element edit: X's subscriber only — no sibling, no shell
    act(() => store.set({ 'runs[s0].epochs': 9 }));
    expect(renders).toEqual({ shell: 1, 'row:s0': 2, 'row:s1': 1 });

    // add: shell only — no surviving element
    let added = '';
    act(() => {
      const result = store.list('runs').add();
      if (result.success) added = result.id;
    });
    expect(renders).toEqual({ shell: 2, 'row:s0': 2, 'row:s1': 1, [`row:${added}`]: 1 });

    // reorder: shell only — rows move by key without re-rendering
    act(() => void store.list('runs').move(added, 0));
    expect(renders).toEqual({ shell: 3, 'row:s0': 2, 'row:s1': 1, [`row:${added}`]: 1 });

    // remove: shell only — the survivors do not re-render
    act(() => void store.list('runs').remove(added));
    expect(renders).toEqual({ shell: 4, 'row:s0': 2, 'row:s1': 1, [`row:${added}`]: 1 });
  });

  it('a Controller inside an element WRITES to its own element — through the real input', () => {
    const store = training.createStore();
    const { getByLabelText } = render(<Shell store={store} />);
    // fire the actual change event: this is the write path the element
    // prefix protects — a bare-name write would land on the root key
    act(() => {
      fireEvent.change(getByLabelText('epochs-s1'), { target: { value: '3' } });
    });
    expect(store.getField('runs[s1].epochs')?.value).toBe(3);
    expect(store.getField('runs[s0].epochs')?.value).toBe(5);
    expect(store.getField('epochs')).toBeNull(); // nothing leaked to a root key
    expect((getByLabelText('epochs-s1') as HTMLInputElement).value).toBe('3');
    expect((getByLabelText('epochs-s0') as HTMLInputElement).value).toBe('5');
  });
});
