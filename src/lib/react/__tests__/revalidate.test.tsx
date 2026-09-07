import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { z } from 'zod';
import { defineGraph } from '../../core/index.js';
import { Controller } from '../Controller.js';

/**
 * revalidate: 'touched' through the react binding: a live-surfaced error
 * reaches the render props like any snapshot change — no binding work needed,
 * pinned anyway (proposal-0.5 §3's "verify with one reactivity test each").
 */
describe("react binding: revalidate 'touched'", () => {
  it('the error render prop goes live on the offending write and lifts on the fix', () => {
    const strict = defineGraph().field('epochs', {
      input: z.coerce.number().optional(),
      output: z.number().max(20, 'Too many'),
      default: 5,
    });
    const store = strict.createStore({ ext: undefined, revalidate: 'touched' });
    const seen: (string | undefined)[] = [];
    render(
      <Controller
        store={store}
        name="epochs"
        render={({ error }) => {
          seen.push(error?.message);
          return null;
        }}
      />
    );
    act(() => store.set({ epochs: 99 }));
    act(() => store.set({ epochs: 3 }));
    expect(seen).toEqual([undefined, 'Too many', undefined]);
  });
});
