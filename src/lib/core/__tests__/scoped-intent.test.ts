import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { codec, defineForm, hasField, type Fields, type StorageAdapter } from '../index.js';
import { scopedAddress } from '../scope.js';

/**
 * Scoped intent: a field declares WHERE ITS MEMORY LIVES at the call site, and
 * the scope values become part of the intent address. This is the design from
 * the rethink doc's "Storage" section — it replaces v1's ~540-line storage
 * adapter + valueProvider/scopeDependencies machinery, and closes the flat-
 * intent hole where a key shared by two branches could only remember one value.
 */

type Ext = { maxSteps: number };
const ext: Ext = { maxSteps: 100 };

const ECOSYSTEMS = ['Flux', 'SD'] as const;
const MODELS: Record<string, { id: number; turbo: boolean }[]> = {
  Flux: [
    { id: 1, turbo: false },
    { id: 2, turbo: true },
  ],
  SD: [{ id: 3, turbo: false }],
};

const ecosystemCodec = codec<(typeof ECOSYSTEMS)[number], { options: readonly string[] }>({
  output: z.enum(ECOSYSTEMS),
  default: 'Flux',
  meta: { options: ECOSYSTEMS },
});
const modelCodec = codec<number>({ output: z.number(), input: z.coerce.number().optional() });
const stepsCodec = codec<number>({ output: z.number(), input: z.coerce.number().optional() });
const promptCodec = codec<string>({ output: z.string(), default: '' });

/**
 * `steps` is scoped per ecosystem — except for turbo models, where it is scoped
 * per model id (the conditional-scope ternary from the design doc).
 */
const scopedForm = defineForm<Ext>()({
  resolve: (f: Fields, _ext: Ext) => {
    const prompt = f.field('prompt', promptCodec);
    const ecosystem = f.field('ecosystem', ecosystemCodec);
    const model = f.field('model', modelCodec, {
      default: MODELS[ecosystem]![0]!.id,
      scope: ecosystem,
      project: (id) => (MODELS[ecosystem]!.some((m) => m.id === id) ? id : MODELS[ecosystem]![0]!.id),
    });
    const turbo = MODELS[ecosystem]!.find((m) => m.id === model)?.turbo ?? false;

    const steps = f.field('steps', stepsCodec, {
      default: turbo ? 4 : 25,
      scope: turbo ? [ecosystem, model] : [ecosystem],
    });

    return { prompt, ecosystem, model, turbo, steps };
  },
});

describe('scoped addresses', () => {
  it('builds canonical addresses and escapes separator characters', () => {
    expect(scopedAddress('steps', undefined)).toBe('steps');
    expect(scopedAddress('steps', 'Flux')).toBe('steps@Flux');
    expect(scopedAddress('steps', ['Flux', 2])).toBe('steps@Flux/2');
    expect(scopedAddress('steps', ['a@b/c', true])).toBe('steps@a%40b%2Fc/true');
  });

  it('rejects non-primitive scope values with a clear error', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => scopedAddress('steps', { id: 1 } as any)).toThrow(/Invalid scope value/);
  });
});

describe('per-scope memory (the shared-key hole, closed)', () => {
  it('remembers a different value for the same KEY in each scope', () => {
    const store = scopedForm.createStore({ ext });

    store.set({ steps: 40 }); // Flux
    store.set({ ecosystem: 'SD' });
    expect(store.getField('steps')?.value).toBe(25); // SD's own default, not Flux's 40

    store.set({ steps: 20 }); // SD
    store.set({ ecosystem: 'Flux' });
    expect(store.getField('steps')?.value).toBe(40);

    store.set({ ecosystem: 'SD' });
    expect(store.getField('steps')?.value).toBe(20);
  });

  it('keeps both buckets visible in intent', () => {
    const store = scopedForm.createStore({ ext });
    store.set({ steps: 40 });
    store.set({ ecosystem: 'SD' });
    store.set({ steps: 20 });

    expect(store.getIntent()).toMatchObject({ 'steps@Flux': 40, 'steps@SD': 20 });
  });

  it('switches buckets when a conditional scope changes shape (turbo per model)', () => {
    const store = scopedForm.createStore({ ext });

    store.set({ steps: 40 }); // Flux base -> steps@Flux
    store.set({ model: 2 }); // turbo -> scope becomes [Flux, 2]
    expect(store.getField('steps')?.value).toBe(4); // turbo default, base's 40 untouched

    store.set({ steps: 8 }); // -> steps@Flux/2
    store.set({ model: 1 });
    expect(store.getField('steps')?.value).toBe(40); // base bucket intact

    store.set({ model: 2 });
    expect(store.getField('steps')?.value).toBe(8); // turbo bucket intact
  });
});

describe('pending flow', () => {
  it('files boundary defaults into the bucket the field resolves with', () => {
    const store = scopedForm.createStore({ ext, defaults: { steps: '33', ecosystem: 'SD' } });

    expect(store.getField('steps')?.value).toBe(33); // coerced by the input schema
    // Intent keeps the RAW boundary value; it re-parses lazily on read (cached
    // by entry identity), same as v1 persisting raw storage values.
    expect(store.getIntent()).toMatchObject({ 'steps@SD': '33' });
    expect(store.getIntent()).not.toHaveProperty('steps');
  });

  it('serves an inactive-field write from the bare key once the field returns', () => {
    const gated = defineForm<{ on: boolean }>()({
      resolve: (f: Fields, gateExt: { on: boolean }) => {
        const base = { prompt: f.field('prompt', promptCodec) };
        if (!gateExt.on) return base;
        return { ...base, steps: f.field('steps', stepsCodec, { default: 25, scope: 'fixed' }) };
      },
    });

    const store = gated.createStore({ ext: { on: false } });
    store.set({ steps: 42 }); // steps is not resolved -> lands at the bare key
    expect(store.getField('steps')).toBeNull();
    expect(store.getIntent()).toMatchObject({ steps: 42 });

    store.setExt({ on: true });
    expect(store.getField('steps')?.value).toBe(42); // bare-key fallback

    store.set({ steps: 50 }); // explicit write supersedes and cleans the fallback
    expect(store.getIntent()).toMatchObject({ 'steps@fixed': 50 });
    expect(store.getIntent()).not.toHaveProperty('steps');
  });

  it('clears the current bucket on set(undefined)', () => {
    const store = scopedForm.createStore({ ext });
    store.set({ steps: 40 });
    store.set({ steps: undefined });

    expect(store.getField('steps')?.value).toBe(25);
    expect(store.getIntent()).not.toHaveProperty('steps@Flux');
  });
});

describe('reset and storage with scopes', () => {
  let saved: Record<string, unknown> = {};
  const storage: StorageAdapter = {
    load: () => saved,
    save: (intent) => {
      saved = intent;
    },
  };

  beforeEach(() => {
    saved = {};
  });

  it('reset(exclude) keeps every bucket of an excluded key', () => {
    const store = scopedForm.createStore({ ext });
    store.set({ steps: 40 });
    store.set({ ecosystem: 'SD' });
    store.set({ steps: 20, prompt: 'a cat' });

    store.reset({ exclude: ['steps'] });

    expect(store.getIntent()).toMatchObject({ 'steps@Flux': 40, 'steps@SD': 20 });
    expect(store.getField('prompt')?.value).toBe('');
  });

  it('round-trips scoped buckets through storage', () => {
    const first = scopedForm.createStore({ ext, storage });
    first.set({ steps: 40 });
    first.set({ ecosystem: 'SD' });
    first.set({ steps: 20 });

    const second = scopedForm.createStore({ ext, storage });
    expect(second.getField('steps')?.value).toBe(20); // SD is the persisted selection
    second.set({ ecosystem: 'Flux' });
    expect(second.getField('steps')?.value).toBe(40);
  });
});

describe('one-shot resolution (server parse, introspection) ignores scoping', () => {
  it('parse finds raw input by key for scoped fields', () => {
    const result = scopedForm.parse({ ecosystem: 'SD', steps: 20, prompt: 'a cat' }, ext);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ ecosystem: 'SD', steps: 20 });
  });

  it('introspection pins work on scoped fields', () => {
    expect(hasField(scopedForm, 'steps', { ecosystem: 'SD' }, ext)).toBe(true);
  });
});
