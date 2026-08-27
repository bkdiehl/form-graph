import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  codec,
  defineForm,
  type Fields,
  type InferCodecMeta,
  type InferCodecValue,
  type InferCodecs,
} from '../index.js';
import { defineFieldKit } from '../field-kit.js';

const STEPS = codec({
  input: z.coerce.number().optional(),
  output: z.number().min(1).max(50),
  default: 25,
});

const stepsKit = defineFieldKit<{ max: number }, void, number>({
  key: 'steps',
  codec: STEPS,
})({ max: 50 });

describe('codecs slot accepts kits', () => {
  const form = defineForm()({
    // A kit registers directly — no `.codec` repetition.
    codecs: { steps: stepsKit },
    resolve: (f: Fields) => ({ steps: stepsKit.field(f, undefined) }),
  });

  it('unwraps the kit to its codec at runtime', () => {
    expect(form.codecs.steps).toBe(STEPS);
  });

  it('and at the type level', () => {
    type Registry = InferCodecs<typeof form>;
    type Assert<T extends true> = T;
    type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
      ? true
      : false;
    // The kit's declared codec type survives (value/meta — what typedFields
    // and <Field> derive from), not the concrete literal type.
    type _value = Assert<Equals<InferCodecValue<Registry['steps']>, number>>;
    type _meta = Assert<Equals<InferCodecMeta<Registry['steps']>, undefined>>;
    expect(true).toBe(true);
  });
});

describe('createStore is argument-free for void-Ext forms', () => {
  const form = defineForm()({
    resolve: (f: Fields) => ({ steps: f.field('steps', STEPS) }),
  });

  it('no options object needed', () => {
    const store = form.createStore();
    expect(store.getField('steps')?.value).toBe(25);
  });

  it('options without ext still work (storage, defaults)', () => {
    const store = form.createStore({ defaults: { steps: 30 } });
    expect(store.getField('steps')?.value).toBe(30);
  });
});

describe('output() refuses an invalid form', () => {
  const REQUIRED = codec({
    input: z.string().optional(),
    output: z.string().min(1, 'required'),
    default: '',
  });
  const form = defineForm()({
    resolve: (f: Fields) => ({ name: f.field('name', REQUIRED) }),
  });

  it('throws naming the failing keys', () => {
    const store = form.createStore();
    expect(() => store.output()).toThrowError(/invalid \(name\)/);
  });

  it('returns the validated data once valid', () => {
    const store = form.createStore();
    store.set({ name: 'ok' });
    expect(store.output()).toEqual({ name: 'ok' });
  });
});
