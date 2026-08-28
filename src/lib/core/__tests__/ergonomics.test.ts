import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  codec,
  codecFamily,
  defineForm,
  type Fields,
  type InferCodecMeta,
  type InferCodecValue,
  type InferCodecs,
} from '../index.js';
import { enumCodec, numberCodec } from '../../codecs/basic.js';
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
  const form = defineForm({
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
  const form = defineForm({
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
  const form = defineForm({
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

describe('registry-backed f.field (codec omitted)', () => {
  const NUM = codec({
    input: z.coerce.number().optional(),
    output: z.number(),
    default: 5,
    coerce: (raw) => Number(raw),
  });

  it('resolves a registered key without repeating the codec, fully typed', () => {
    const form = defineForm({
      codecs: { count: NUM },
      resolve: (f) => ({ count: f.field('count') }),
    });
    const store = form.createStore();
    expect(store.getState().count).toBe(5);
    store.set({ count: '9' });
    // the registry-resolved codec's coerce ran on the trusted write
    expect(store.getState().count).toBe(9);
  });

  it('still accepts an explicit codec, with options in either position', () => {
    const form = defineForm({
      codecs: { count: NUM },
      resolve: (f) => ({ count: f.field('count', { default: 7 }) }),
    });
    expect(form.createStore().getState().count).toBe(7);
  });

  it('throws a naming error for an unregistered key', () => {
    const form = defineForm({
      resolve: (f) => ({ oops: f.field('oops' as never) }),
    });
    expect(() => form.createStore()).toThrow(/No codec for field "oops"/);
  });
});

describe('meta override receives the codec base', () => {
  const SIZE = codec<'s' | 'l', { options: { value: 's' | 'l'; disabled?: boolean }[] }>({
    input: z.enum(['s', 'l']).optional(),
    output: z.enum(['s', 'l']),
    default: 's',
    meta: { options: [{ value: 's' }, { value: 'l' }] },
  });

  it('patches instead of retyping, and re-derives on correction', () => {
    const form = defineForm({
      codecs: { size: SIZE },
      resolve: (f) => {
        let size = f.field('size', {
          meta: (_v, base) => ({
            options: (base?.options ?? []).map((o) => (o.value === 'l' ? { ...o, disabled: true } : o)),
          }),
        });
        if (size === 'l') size = f.correct('size', 's', 'l_unavailable');
        return { size };
      },
    });
    const store = form.createStore({ defaults: { size: 'l' } });
    // corrected to 's', and the meta (re-derived after the correction) still
    // carries the patched disabled flag from the base options
    expect(store.getState().size).toBe('s');
    const meta = store.getField('size')?.meta as { options: { value: string; disabled?: boolean }[] };
    expect(meta.options).toEqual([{ value: 's' }, { value: 'l', disabled: true }]);
  });
});

describe('constrain: one declaration in the codec vocabulary, both halves', () => {
  const CLS = enumCodec({
    options: [
      { value: 'standard', label: 'Standard' },
      { value: 'glacier', label: 'Glacier' },
    ],
    default: 'standard',
  });
  const TOKYO = codec({ input: z.boolean().optional(), output: z.boolean(), default: false });

  const form = defineForm({
    codecs: { tokyo: TOKYO, cls: CLS },
    resolve: (f) => {
      const tokyo = f.field('tokyo');
      return {
        tokyo,
        cls: f.field('cls', {
          constrain: { glacier: tokyo && 'unavailable_in_region' },
        }),
      };
    },
  });

  it('open constraint: option enabled, value untouched, no note', () => {
    const store = form.createStore({ defaults: { cls: 'glacier' } });
    expect(store.getState().cls).toBe('glacier');
    expect(store.getNotes()).toEqual([]);
  });

  it('closed constraint: option disabled AND value corrected with the reason', () => {
    const store = form.createStore({ defaults: { cls: 'glacier', tokyo: true } });
    expect(store.getState().cls).toBe('standard');
    expect(store.getNotes()).toEqual([
      {
        key: 'cls',
        kind: 'unavailable_in_region',
        detail: { from: 'glacier', to: 'standard', gated: 'glacier' },
      },
    ]);
    const meta = store.getField('cls')!.meta as { options: { value: string; disabled?: boolean }[] };
    expect(meta.options[1]).toMatchObject({ value: 'glacier', disabled: true });
  });

  it('reopening restores the remembered choice', () => {
    const store = form.createStore({ defaults: { cls: 'glacier', tokyo: true } });
    store.set({ tokyo: false });
    expect(store.getState().cls).toBe('glacier');
    expect(store.getNotes()).toEqual([]);
  });

  it('numberCodec bounds: meta tightens and the value clamps with the reason', () => {
    const VCPUS = numberCodec({ min: 2, max: 64, step: 2, default: 8 });
    const nform = defineForm({
      codecs: { vcpus: VCPUS },
      resolve: (f) => ({
        vcpus: f.field('vcpus', { constrain: { max: 16, reason: 'tier_limit' } }),
      }),
    });
    const store = nform.createStore({ defaults: { vcpus: 40 } });
    expect(store.getState().vcpus).toBe(16);
    expect(store.getNotes()).toEqual([
      { key: 'vcpus', kind: 'tier_limit', detail: { from: 40, to: 16, min: 2, max: 16 } },
    ]);
    expect(store.getField('vcpus')!.meta).toEqual({ min: 2, max: 16, step: 2 });
  });

  it('throws when constraining a codec with no vocabulary', () => {
    const bare = codec({ input: z.string().optional(), output: z.string(), default: '' });
    const bad = defineForm({
      codecs: { plain: bare },
      // @ts-expect-error — constrain is never for codecs without a vocabulary
      resolve: (f) => ({ plain: f.field('plain', { constrain: { x: 'nope' } }) }),
    });
    expect(() => bad.createStore()).toThrow(/defines no constraint vocabulary/);
  });
});

describe('codecFamily', () => {
  it('memoizes per parameter list — same args, same instance', () => {
    let builds = 0;
    const FAM = codecFamily((max: number) => {
      builds++;
      return codec({ input: z.coerce.number().optional(), output: z.number().max(max), default: 0 });
    });
    expect(FAM(5)).toBe(FAM(5));
    expect(FAM(5)).not.toBe(FAM(9));
    expect(builds).toBe(2);
  });

  it('keeps a per-pass parameterised field churn-free', () => {
    const FAM = codecFamily((max: number) =>
      codec({ input: z.coerce.number().optional(), output: z.number(), default: 0, coerce: (r) => Math.min(Number(r), max) })
    );
    const form = defineForm({
      resolve: (f: Fields, ext: { max: number }) => ({ n: f.field('n', FAM(ext.max)) }),
    });
    const store = form.createStore({ ext: { max: 7 } });
    store.set({ n: 3 });
    store.set({ n: 99 });
    expect(store.getState().n).toBe(7);
    expect(store.getCodecChurn()).toEqual([]);
  });
});

describe('meta: codec contributes, field patches — each fact once', () => {
  // placeholder is FULLY CONDITIONAL, so the codec omits it entirely; the
  // field is its only home. maxLength is unconditional: codec only.
  const EMAIL = codec<string, { placeholder: string; maxLength: number }>({
    input: z.string().optional(),
    output: z.string(),
    default: '',
    meta: { maxLength: 120 },
  });
  const BUSINESS = codec({ input: z.boolean().optional(), output: z.boolean(), default: false });

  it('a fully conditional prop lives only at the field', () => {
    const form = defineForm({
      codecs: { email: EMAIL, business: BUSINESS },
      resolve: (f) => {
        const business = f.field('business');
        return {
          business,
          email: f.field('email', {
            meta: { placeholder: business ? 'billing@acme.com' : 'you@example.com' },
          }),
        };
      },
    });
    const store = form.createStore();
    expect(store.getField('email')!.meta).toEqual({
      placeholder: 'you@example.com',
      maxLength: 120,
    });
    store.set({ business: true });
    expect(store.getField('email')!.meta).toEqual({
      placeholder: 'billing@acme.com',
      maxLength: 120,
    });
  });

  it('default-with-exception patches only the exception — empty else keeps the codec value', () => {
    const form = defineForm({
      codecs: { email: EMAIL, business: BUSINESS },
      resolve: (f) => {
        const business = f.field('business');
        return {
          business,
          email: f.field('email', { meta: business ? { maxLength: 500 } : {} }),
        };
      },
    });
    const store = form.createStore();
    expect(store.getField('email')!.meta).toEqual({ maxLength: 120 });
    store.set({ business: true });
    expect(store.getField('email')!.meta).toEqual({ maxLength: 500 });
  });

  it('the function form still replaces (full control, base is the codec contribution)', () => {
    const form = defineForm({
      codecs: { email: EMAIL },
      resolve: (f) => ({
        email: f.field('email', {
          meta: (_v, base) => ({ placeholder: 'fixed', maxLength: (base?.maxLength ?? 0) / 2 }),
        }),
      }),
    });
    expect(form.createStore().getField('email')!.meta).toEqual({
      placeholder: 'fixed',
      maxLength: 60,
    });
  });
});
