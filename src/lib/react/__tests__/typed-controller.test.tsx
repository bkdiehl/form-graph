import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { z } from 'zod';
import { codec, defineForm, type Fields, type RegistryMetas, type RegistryValues } from '../../core/index.js';
import { createTypedController, FormProvider } from '../index.js';

/**
 * The decided Q8 pattern: one app-side codec registry object drives per-key
 * Value/Meta inference — no generics at Controller call sites, O(1) type cost.
 */

const STEPS = codec<number, { min: number; max: number }>({
  output: z.number(),
  default: 25,
  meta: { min: 1, max: 50 },
});
const PROMPT = codec<string>({ output: z.string(), default: '' });

const registry = { steps: STEPS, prompt: PROMPT };
const AppController = createTypedController<typeof registry>();

const form = defineForm<void>()({
  resolve: (f: Fields) => ({
    steps: f.field('steps', STEPS),
    prompt: f.field('prompt', PROMPT),
  }),
});

// --- compile-time assertions -----------------------------------------------
type Assert<T extends true> = T;
type Equals<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
  ? true
  : false;

type Values = RegistryValues<typeof registry>;
type Metas = RegistryMetas<typeof registry>;

type _StepsValue = Assert<Equals<Values['steps'], number>>;
type _PromptValue = Assert<Equals<Values['prompt'], string>>;
type _StepsMeta = Assert<Equals<Metas['steps'], { min: number; max: number }>>;

describe('createTypedController', () => {
  it('renders with inferred value and meta (no call-site generics)', () => {
    const store = form.createStore({ ext: undefined });

    render(
      <FormProvider store={store}>
        <AppController
          name="steps"
          render={({ value, meta, onChange }) => (
            // value: number, meta: { min; max } — both inferred from the registry.
            <input
              type="range"
              aria-label="steps"
              min={meta.min}
              max={meta.max}
              value={value}
              onChange={(e) => onChange(Number(e.currentTarget.value))}
            />
          )}
        />
      </FormProvider>
    );

    const input = screen.getByLabelText('steps') as HTMLInputElement;
    expect(input.value).toBe('25');
    expect(input.min).toBe('1');
    expect(input.max).toBe('50');
  });

  it('rejects unknown names and wrong value types at compile time', () => {
    // @ts-expect-error — 'nope' is not a registry key
    const bad = <AppController name="nope" render={() => null} />;
    const alsoBad = (
      <AppController
        name="prompt"
        // @ts-expect-error — prompt's value is string, not number
        render={({ value }: { value: number }) => null}
      />
    );
    expect(bad).toBeDefined();
    expect(alsoBad).toBeDefined();
  });
});
