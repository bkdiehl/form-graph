import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineForm, type Fields } from '../index.js';
import { enumOf, slider, textOf } from '../def-helpers.js';
import { branch, branchOn, defineGraph } from '../graph.js';

type Assert<T extends true> = T;
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

const s3 = defineGraph()
  .field('bucket', textOf({ default: 'assets' }))
  .field(
    'region',
    enumOf({
      options: [
        { value: 'us-east-1', label: 'US East' },
        { value: 'eu-west-1', label: 'EU West' },
      ],
      default: 'us-east-1',
    })
  );

const email = defineGraph().field('recipient', textOf({ default: '' }));

describe('branchOn', () => {
  const DESTINATION = enumOf({
    options: [
      { value: 's3', label: 'S3' },
      { value: 'email', label: 'Email' },
    ],
    default: 's3',
  });
  const hub = branchOn('destination', DESTINATION, { s3, email });

  const form = defineForm({
    codecs: hub.codecs,
    resolve: (f) => hub.resolve(f),
  });

  it('declares the discriminator and resolves the picked member', () => {
    const store = form.createStore();
    expect(store.getState()).toEqual({ destination: 's3', bucket: 'assets', region: 'us-east-1' });

    store.set({ destination: 'email' });
    expect(store.getState()).toEqual({ destination: 'email', recipient: '' });
    expect(store.getField('bucket')).toBeNull();
  });

  it('merges every member registry', () => {
    expect(Object.keys(hub.codecs).sort()).toEqual(['bucket', 'destination', 'recipient', 'region']);
  });

  it('types the state as a union discriminated by the key', () => {
    type State = ReturnType<typeof hub.resolve>;
    type S3 = Extract<State, { destination: 's3' }>;
    type Email = Extract<State, { destination: 'email' }>;
    type _s3Tag = Assert<Equals<S3['destination'], 's3'>>;
    type _s3Region = Assert<Equals<S3['region'], 'us-east-1' | 'eu-west-1'>>;
    type _s3Keys = Assert<Equals<keyof S3, 'destination' | 'bucket' | 'region'>>;
    type _emailKeys = Assert<Equals<keyof Email, 'destination' | 'recipient'>>;
    // the union really is discriminated: the other arm's keys are absent
    type _noCrossTalk = Assert<Equals<Extract<Email, { bucket: string }>, never>>;
    expect(true).toBe(true);
  });
});

describe('branch', () => {
  type Ext = { tier: 'free' | 'pro' };

  const free = defineGraph<Ext>().field('steps', slider({ min: 1, max: 10, default: 5 }));
  const pro = defineGraph<Ext>()
    .field('steps', slider({ min: 1, max: 50, default: 25 }))
    .field('seed', slider({ min: 0, max: 1000, default: 0 }))
    .effect({
      steps: (steps) => (steps === 50 ? { seed: 7 } : undefined),
    });

  const hub = branch((ext: Ext) => ext.tier, { free, pro });

  const form = defineForm({
    codecs: hub.codecs,
    resolve: (f: Fields, ext: Ext) => hub.resolve(f, ext),
    reconcile: [...hub.effects],
  });

  it('dispatches on the ext-derived key', () => {
    const store = form.createStore({ ext: { tier: 'free' } });
    expect(store.getState()).toEqual({ steps: 5 });
    store.setExt({ tier: 'pro' });
    expect(store.getState()).toEqual({ steps: 25, seed: 0 });
  });

  it("carries the members' effects to the mounting form", () => {
    expect(hub.effects).toHaveLength(1);
    const store = form.createStore({ ext: { tier: 'pro' } });
    store.set({ steps: 50 });
    expect(store.getState()).toEqual({ steps: 50, seed: 7 });
  });

  it("AUTO-SCOPES a member's effects to that member being picked", () => {
    // Rules see the RAW patch (reconcile runs before codecs), so steps: 50
    // would trigger pro's rule — but free is active, so it must not fire.
    const store = form.createStore({ ext: { tier: 'free' } });
    store.set({ steps: 50 });
    expect(store.getIntent()).not.toHaveProperty('seed');
  });

  it('chains its own effects with .effect, like a graph', () => {
    const capped = branch((ext: Ext) => ext.tier, { free, pro }).effect({
      steps: (steps: unknown) =>
        typeof steps === 'number' && steps > 40 ? { steps: 40 } : undefined,
    });
    expect(capped.effects).toHaveLength(2);
    expect(hub.effects).toHaveLength(1); // the original hub is untouched

    const cappedForm = defineForm({
      codecs: capped.codecs,
      resolve: (f: Fields, ext: Ext) => capped.resolve(f, ext),
      reconcile: [...capped.effects],
    });
    const store = cappedForm.createStore({ ext: { tier: 'pro' } });
    store.set({ steps: 50 });
    expect(store.getState()).toEqual({ steps: 40, seed: 7 });
  });

  it('tagged: stamps the picked member key into state as a computed', () => {
    const tagged = branch('tier', (ext: Ext) => ext.tier, { free, pro });
    const store = tagged.createStore({ ext: { tier: 'pro' } });
    expect(store.getState()).toEqual({ tier: 'pro', steps: 25, seed: 0 });
    expect(store.getComputedKeys()).toContain('tier');

    type State = ReturnType<typeof tagged.resolve>;
    type Pro = Extract<State, { tier: 'pro' }>;
    type _proKeys = Assert<Equals<keyof Pro, 'tier' | 'steps' | 'seed'>>;
    type _free = Assert<Equals<Extract<State, { tier: 'free' }>['steps'], number>>;
  });

  it('merges a shared prefix effect ONCE across members', () => {
    const shared = defineGraph<Ext>()
      .field('steps', slider({ min: 1, max: 50, default: 25 }))
      .effect({ steps: () => undefined });
    const a = shared.field('seed', slider({ min: 0, max: 10, default: 0 }));
    const b = shared.field('cfg', slider({ min: 0, max: 10, default: 5 }));
    const twoWays = branch((ext: Ext) => (ext.tier === 'pro' ? 'a' : 'b'), { a, b });
    expect(twoWays.effects).toHaveLength(1);
  });
});

describe('branchOn failure path', () => {
  it('names the key and the unmatched value', () => {
    const GHOST = {
      input: z.string().optional(),
      output: z.string(),
      default: 'ghost',
    } as unknown as import('../graph.js').FieldDef<'real'>;
    const hub = branchOn('kind', GHOST, {
      real: defineGraph().field('x', slider({ min: 0, max: 1, default: 0 })),
    });
    const form = defineForm({
      codecs: hub.codecs,
      resolve: (f) => hub.resolve(f),
    });
    expect(() => form.createStore()).toThrow('branchOn "kind": no member graph for "ghost"');
  });
});
