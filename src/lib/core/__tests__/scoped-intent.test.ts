import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { hasField, type StorageAdapter } from '../index.js';
import { codec } from '../codec.js';
import { defineForm } from '../form.js';
import { type Fields } from '../resolve.js';
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
    let model = f.field('model', modelCodec, {
      default: MODELS[ecosystem]![0]!.id,
      scope: ecosystem,
    });
    if (!MODELS[ecosystem]!.some((m) => m.id === model)) {
      model = f.correct('model', MODELS[ecosystem]![0]!.id, 'ecosystem_mismatch');
    }
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

describe('reserved characters in field keys', () => {
  // The address grammar owns @ / [ ] % . — see docs/array-intent-addressing.md.
  // [ ] and . are reserved for per-item addressing (dotted member paths,
  // `runs[a1b2].engine`) before any list API exists, so no persisted record
  // can ever contain an ambiguous address.
  it.each(['@', '/', '[', ']', '%', '.'])('rejects a key containing "%s"', (ch) => {
    expect(() => scopedAddress(`bad${ch}key`, undefined)).toThrow(/reserved/);
  });

  it('accepts ordinary keys and still escapes scope values', () => {
    expect(scopedAddress('steps', 'a@b/c')).toBe('steps@a%40b%2Fc');
  });
});

describe(`reset({ scope: 'active' })`, () => {
  /**
   * The consumer need this answers: a remix resets the form, but the user's choices for the
   * branches they are NOT on are the per-scope memory above, and a plain reset threw all of it
   * away. Narrowing the clear to the active resolution's addresses keeps the rest.
   */
  it('clears the active bucket and keeps the sibling one', () => {
    const store = scopedForm.createStore({ ext });
    store.set({ steps: 40 }); // Flux
    store.set({ ecosystem: 'SD' });
    store.set({ steps: 20 }); // SD, now the active bucket

    store.reset({ scope: 'active' });

    expect(store.getIntent()).toMatchObject({ 'steps@Flux': 40 });
    expect(store.getIntent()).not.toHaveProperty('steps@SD');
  });

  it('clears an unscoped field too, since the active resolution addresses it', () => {
    const store = scopedForm.createStore({ ext });
    store.set({ prompt: 'a cat', steps: 40 });

    store.reset({ scope: 'active' });

    // Not "scoped fields only": a bare address is as active as a scoped one, which is what
    // stops a remix blending the old prompt into the new form.
    expect(store.getIntent()).not.toHaveProperty('prompt');
    expect(store.getIntent()).not.toHaveProperty('steps@Flux');
  });

  it('still honours exclude, which outranks the scope narrowing', () => {
    const store = scopedForm.createStore({ ext });
    store.set({ prompt: 'a cat', steps: 40 });

    store.reset({ exclude: ['prompt'], scope: 'active' });

    expect(store.getIntent()).toMatchObject({ prompt: 'a cat' });
    expect(store.getIntent()).not.toHaveProperty('steps@Flux');
  });

  it('reads the resolution as it stands, so discriminators must be set FIRST', () => {
    // The trap, pinned: called before the switch, 'active' still means the OUTGOING branch,
    // so it clears the bucket the user is leaving and spares the one they are heading for -
    // the exact inverse of the intent. Consumers switching branch must set, then reset.
    const wrongOrder = scopedForm.createStore({ ext });
    wrongOrder.set({ steps: 40 }); // Flux
    wrongOrder.set({ ecosystem: 'SD' });
    wrongOrder.set({ steps: 20 }); // SD
    wrongOrder.set({ ecosystem: 'Flux' }); // back to Flux, which is now active
    wrongOrder.reset({ scope: 'active' });
    expect(wrongOrder.getIntent()).toMatchObject({ 'steps@SD': 20 });

    const rightOrder = scopedForm.createStore({ ext });
    rightOrder.set({ steps: 40 });
    rightOrder.set({ ecosystem: 'SD' });
    rightOrder.set({ steps: 20 });
    rightOrder.set({ ecosystem: 'Flux' }); // stage the target, THEN reset it
    rightOrder.reset({ scope: 'active' });
    expect(rightOrder.getIntent()).not.toHaveProperty('steps@Flux');
  });

  it('leaves an unmounted branch addressed by nothing, so its memory survives', () => {
    // model is scoped per ecosystem; steps is scoped per [ecosystem] or [ecosystem, model]
    // for a turbo build. The turbo bucket is unreachable while a non-turbo model is picked,
    // so it is not in the active address set.
    const store = scopedForm.createStore({ ext });
    store.set({ ecosystem: 'Flux', model: 2 }); // turbo
    store.set({ steps: 8 });
    store.set({ model: 1 }); // non-turbo: the turbo-scoped steps bucket is now unmounted
    store.set({ steps: 30 });

    store.reset({ scope: 'active' });

    expect(store.getIntent()).toMatchObject({ 'steps@Flux/2': 8 });
  });

  it('keeps the touched flag of a bucket whose value it kept', () => {
    // Found in review. Narrowing intent WITHOUT narrowing touched state leaves a value the user
    // really did write marked as never-written, so `revalidate: 'touched'` stops re-judging it:
    // a preserved value that later goes invalid (ext moved, an option was delisted) surfaces
    // nothing until it is written again. validate() still refuses at submit, which is precisely
    // why this would have been found late and from a confused bug report.
    //
    // Its own form because the shared fixture has no ext-driven bound, so nothing there can make
    // a stored value go bad without rewriting it.
    type Bound = { max: number };
    const nCodec = codec<number>({ output: z.number(), input: z.coerce.number().optional() });
    const boundedForm = defineForm<Bound>()({
      resolve: (f: Fields, bound: Bound) => {
        const eco = f.field('eco', ecosystemCodec);
        const n = f.field('n', nCodec, {
          default: 1,
          scope: eco,
          refine: (output) => output.refine((value) => value <= bound.max, 'Too many'),
        });
        return { eco, n };
      },
    });

    const store = boundedForm.createStore({ ext: { max: 100 }, revalidate: 'touched' });
    store.set({ n: 40 }); // Flux, a real user write
    store.set({ eco: 'SD' });
    store.set({ n: 20 });

    store.reset({ scope: 'active' }); // clears SD, keeps Flux

    store.set({ eco: 'Flux' });
    expect(store.getField('n')?.value).toBe(40); // the value survived

    store.setExt({ max: 10 }); // and now it is out of bounds

    expect(store.getField('n')?.error?.message).toBe('Too many');
  });
  it('clears the bare-key fallback the active field reads, not just its scoped address', () => {
    // Found in review. A scoped read falls back to the bare key, so an entry left there -
    // v1-migrated storage, or a key committed while the field was inactive - is read by the
    // active field. Narrowing to resolved addresses alone left it untouched, and `reset`
    // returned a field to the SAME value it already had. A shadowed bare entry is just as
    // bad: it resurfaces the moment the scoped entry above it is cleared.
    const stored = { steps: 99 };
    const store = scopedForm.createStore({
      ext,
      storage: { load: () => stored, save: () => {} },
    });
    expect(store.getField('steps')?.value).toBe(99); // read through the fallback

    store.reset({ scope: 'active' });

    expect(store.getIntent()).not.toHaveProperty('steps');
    expect(store.getField('steps')?.value).toBe(25); // Flux's default, as a plain reset gives
  });

  it('without the option, clears every bucket as before', () => {
    const store = scopedForm.createStore({ ext });
    store.set({ steps: 40 });
    store.set({ ecosystem: 'SD' });
    store.set({ steps: 20 });

    store.reset();

    expect(store.getIntent()).toEqual({});
  });
});
