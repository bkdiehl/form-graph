import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { z } from 'zod';
import { field, formState, typedFields } from '../index.js';
import { codec, defineForm, type Fields } from '../../core/index.js';
import { defaultExt, miniForm } from '../../__fixtures__/mini-generation.js';

/**
 * The framework-agnostic claim, proven on a second framework: the SAME store,
 * the SAME reference-preserving diff, and per-field wake-ups — expressed
 * through Svelte 5 effects instead of useSyncExternalStore. This mirrors the
 * React render-isolation tests' central assertion.
 */
describe('svelte binding: per-field reactivity', () => {
  it(`editing one field wakes only that field: no cross-field wakeups`, () => {
    const store = miniForm.createStore({ ext: defaultExt });
    const prompt = field<string>(store, 'prompt');
    const steps = field<number>(store, 'steps');

    let promptRuns = 0;
    let stepsRuns = 0;
    const cleanup = $effect.root(() => {
      $effect(() => {
        void prompt.current;
        promptRuns++;
      });
      $effect(() => {
        void steps.current;
        stepsRuns++;
      });
    });
    flushSync();
    expect({ promptRuns, stepsRuns }).toEqual({ promptRuns: 1, stepsRuns: 1 });

    store.set({ prompt: 'a cat' });
    flushSync();
    expect({ promptRuns, stepsRuns }).toEqual({ promptRuns: 2, stepsRuns: 1 });
    expect(prompt.current?.value).toBe('a cat');

    cleanup();
  });

  it('a field returns null outside its branch and reappears on return', () => {
    const store = miniForm.createStore({ ext: defaultExt });
    const steps = field<number>(store, 'steps');

    let seen: (number | undefined)[] = [];
    const cleanup = $effect.root(() => {
      $effect(() => {
        seen.push(steps.current?.value as number | undefined);
      });
    });
    flushSync();

    store.set({ workflow: 'image:upscale' });
    flushSync();
    store.set({ workflow: 'image:create' });
    flushSync();

    expect(seen[0]).toBeTypeOf('number');
    expect(seen[1]).toBeUndefined();
    expect(seen[2]).toBe(seen[0]);

    cleanup();
  });

  it('formState tracks the whole snapshot', () => {
    const store = miniForm.createStore({ ext: defaultExt });
    const state = formState(store);

    let runs = 0;
    const cleanup = $effect.root(() => {
      $effect(() => {
        void state.current;
        runs++;
      });
    });
    flushSync();

    store.set({ prompt: 'a dog' });
    flushSync();
    expect(runs).toBe(2);
    expect((state.current as { prompt?: string }).prompt).toBe('a dog');

    cleanup();
  });
});

describe('typedFields', () => {
  const STEPS = codec<number, { min: number; max: number }>({
    input: z.coerce.number().optional(),
    output: z.number().min(1).max(50),
    default: 25,
    meta: { min: 1, max: 50 },
  });
  const NAME = codec<string>({
    input: z.string().optional(),
    output: z.string(),
    default: '',
  });
  // The registry lives IN the form — nothing separate to export or annotate.
  const tinyForm = defineForm({
    codecs: { steps: STEPS, name: NAME },
    resolve: (f: Fields) => ({
      steps: f.field('steps', STEPS),
      name: f.field('name', NAME),
    }),
  });

  it('derives value/meta types from the form and reads like field()', () => {
    const store = tinyForm.createStore({ ext: undefined });
    const f = typedFields(store);

    const steps = f.steps;
    const name = f.name;
    expect(f.steps).toBe(steps); // handles are cached, dot access is stable

    // Type-level: value and meta come from the registry, no call-site generics.
    type Assert<T extends true> = T;
    type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
      ? true
      : false;
    type _StepsValue = Assert<
      Equals<NonNullable<typeof steps.current>['value'], number>
    >;
    type _StepsMeta = Assert<
      Equals<NonNullable<typeof steps.current>['meta'], { min: number; max: number } | undefined>
    >;
    type _NameValue = Assert<Equals<NonNullable<typeof name.current>['value'], string>>;

    let value: number | undefined;
    const cleanup = $effect.root(() => {
      $effect(() => {
        value = steps.current?.value;
      });
    });
    flushSync();
    expect(value).toBe(25);
    expect(steps.current?.meta).toEqual({ min: 1, max: 50 });

    store.set({ steps: 30 });
    flushSync();
    expect(value).toBe(30);
    cleanup();
  });
});
