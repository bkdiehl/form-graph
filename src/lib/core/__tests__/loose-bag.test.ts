import { describe, expect, it } from 'vitest';
import { branch, defineGraph } from './../graph.js';
import { enumOf, slider, textOf } from '../def-helpers.js';

/**
 * Fields declared AFTER a mounted branch read member keys straight off the
 * bag: every arm's keys are visible, typed `T | undefined` where an arm lacks
 * them. Only the callback bag is loosened — parse().state keeps the real
 * discriminated union. Born from civitai's image hub, whose
 * enhancedCompatibility/quantity fields read the active family's model.
 */

const withModel = defineGraph<{ kind: string }>()
  .field('model', textOf({ default: 'checkpoint-a' }))
  .field('steps', slider({ min: 1, max: 50, default: 30 }));

const withoutModel = defineGraph<{ kind: string }>().field(
  'steps',
  slider({ min: 1, max: 20, default: 9 })
);

const families = branch(
  'family',
  (ext: { kind: string }) => (ext.kind === 'full' ? 'full' : 'lite'),
  { full: withModel, lite: withoutModel }
);

const hub = defineGraph<{ kind: string }>()
  .field(
    'kind',
    enumOf({
      options: [
        { value: 'full', label: 'Full' },
        { value: 'lite', label: 'Lite' },
      ],
      default: 'full',
    })
  )
  .use(families)
  // `model` exists only on the `full` arm — destructured, not cast
  .computed('summary', ({ model, steps }) => `${model ?? 'none'}/${steps}`);

describe('loose bag after a mounted branch', () => {
  type Assert<T extends true> = T;
  type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

  it('a later field reads a some-arms-only key as T | undefined', () => {
    const full = hub.parse({ kind: 'full' }, { kind: 'full' });
    if (!full.success) throw new Error('unexpected');
    expect((full.state as { summary: string }).summary).toBe('checkpoint-a/30');

    const lite = hub.parse({ kind: 'lite' }, { kind: 'lite' });
    if (!lite.success) throw new Error('unexpected');
    expect((lite.state as { summary: string }).summary).toBe('none/9');
  });

  it('the STATE type keeps the discriminated union — only the bag is loosened', () => {
    const result = hub.parse({ kind: 'full' }, { kind: 'full' });
    if (!result.success) throw new Error('unexpected');
    type State = typeof result.state;
    // narrowing on the branch tag still narrows sibling keys in state
    const s = result.state as State;
    if (s.family === 'full') {
      type _model = Assert<Equals<typeof s.model, string>>;
    }
    expect(s.family).toBe('full');
  });
});
