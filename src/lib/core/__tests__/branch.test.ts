import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineForm } from '../form.js';
import { type Fields } from '../resolve.js';
import { enumOf, slider, textOf } from '../def-helpers.js';
import { branch, defineGraph } from '../graph.js';

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

describe('keyed branch — dispatch on an upstream field', () => {
  const DESTINATION = enumOf({
    options: [
      { value: 's3', label: 'S3' },
      { value: 'email', label: 'Email' },
    ],
    default: 's3',
  });
  const hub = defineGraph()
    .field('destination', DESTINATION)
    .use(
      branch('destination', [
        [['s3'], s3],
        [['email'], email],
      ] as const)
    );

  it('the field declares the discriminator; the table routes on it', () => {
    const store = hub.createStore();
    expect(store.getState()).toEqual({ destination: 's3', bucket: 'assets', region: 'us-east-1' });

    store.set({ destination: 'email' });
    expect(store.getState()).toEqual({ destination: 'email', recipient: '' });
    expect(store.getField('bucket')).toBeNull();
  });

  it('merges every member registry', () => {
    expect(Object.keys(hub.defs).sort()).toEqual(['bucket', 'destination', 'recipient', 'region']);
  });

  it('a grouped pair is ONE arm, its keys a union on the discriminator', () => {
    const DEST3 = enumOf({
      options: [
        { value: 's3', label: 'S3' },
        { value: 'email', label: 'Email' },
        { value: 'email2', label: 'Email 2' },
      ],
      default: 's3',
    });
    const grouped = defineGraph()
      .field('destination', DEST3)
      .use(
        branch('destination', [
          [['s3'], s3],
          [['email', 'email2'], email],
        ] as const)
      );
    const store = grouped.createStore();
    store.set({ destination: 'email2' });
    expect(store.getState()).toEqual({ destination: 'email2', recipient: '' });

    type State = ReturnType<typeof grouped.resolve>;
    // one arm per PAIR: the email arm's key is the two-literal union, so the
    // union's arm count matches the family count, not the key count
    type EmailArm = Extract<State, { recipient: string }>;
    type _pairUnion = Assert<Equals<EmailArm['destination'], 'email' | 'email2'>>;
    type _s3Arm = Assert<Equals<Extract<State, { bucket: string }>['destination'], 's3'>>;
  });

  it('an unknown resolved value is a loud error', () => {
    const LOOSE = { input: z.string().optional(), output: z.string(), default: 'nope' };
    const bad = defineGraph()
      .field('destination', LOOSE)
      .use(branch('destination', [[['s3'], s3]] as const));
    expect(() => bad.parse({})).toThrow(/no member graph for "nope"/);
  });

  it('a patch that switches member fires the TARGET member rules', () => {
    const emailRuled = defineGraph()
      .field('recipient', textOf({ default: '' }))
      .effect({
        recipient: (r) => (r === 'ceo' ? { recipient: 'ceo@example.com' } : undefined),
      });
    const switching = defineGraph()
      .field('destination', DESTINATION)
      .use(
        branch('destination', [
          [['s3'], s3],
          [['email'], emailRuled],
        ] as const)
      );
    const store = switching.createStore();
    store.set({ destination: 'email', recipient: 'ceo' });
    expect(store.getState()).toEqual({ destination: 'email', recipient: 'ceo@example.com' });
  });
});

describe('tagged branch — the key is derived and stamped', () => {
  type Ext = { tier: 'free' | 'pro' };

  const free = defineGraph<Ext>().field('steps', slider({ min: 1, max: 10, default: 5 }));
  const pro = defineGraph<Ext>()
    .field('steps', slider({ min: 1, max: 50, default: 25 }))
    .field('seed', slider({ min: 0, max: 1000, default: 0 }))
    .effect({
      steps: (steps) => (steps === 50 ? { seed: 7 } : undefined),
    });

  const hub = branch('tier', (ext: Ext) => ext.tier, { free, pro });

  const form = defineForm({
    defs: hub.defs,
    resolve: (f: Fields, ext: Ext) => hub.resolve(f, ext),
    reconcile: [...hub.effects],
  });

  it('dispatches on the ext-derived key and stamps it', () => {
    const store = form.createStore({ ext: { tier: 'free' } });
    expect(store.getState()).toEqual({ tier: 'free', steps: 5 });
    store.setExt({ tier: 'pro' });
    expect(store.getState()).toEqual({ tier: 'pro', steps: 25, seed: 0 });
  });

  it('carries the members effects, auto-scoped by the stamped tag', () => {
    expect(hub.effects).toHaveLength(1);
    const proStore = form.createStore({ ext: { tier: 'pro' } });
    proStore.set({ steps: 50 });
    expect(proStore.getState()).toEqual({ tier: 'pro', steps: 50, seed: 7 });

    // the free tier never activates the pro rule — the tag scopes it out
    const freeStore = form.createStore({ ext: { tier: 'free' } });
    freeStore.set({ steps: 50 });
    expect(freeStore.getIntent()).not.toHaveProperty('seed');
  });

  it('chains its own effects with .effect, like a graph', () => {
    const capped = branch('tier', (ext: Ext) => ext.tier, { free, pro }).effect({
      steps: (steps: unknown) =>
        typeof steps === 'number' && steps > 40 ? { steps: 40 } : undefined,
    });
    expect(capped.effects).toHaveLength(2);
    expect(hub.effects).toHaveLength(1); // the original hub is untouched

    const cappedForm = defineForm({
      defs: capped.defs,
      resolve: (f: Fields, ext: Ext) => capped.resolve(f, ext),
      reconcile: [...capped.effects],
    });
    const store = cappedForm.createStore({ ext: { tier: 'pro' } });
    store.set({ steps: 50 });
    expect(store.getState()).toEqual({ tier: 'pro', steps: 40, seed: 7 });
  });

  it('stamps the picked member key into state as a computed', () => {
    const store = hub.createStore({ ext: { tier: 'pro' } });
    expect(store.getState()).toEqual({ tier: 'pro', steps: 25, seed: 0 });
    expect(store.getComputedKeys()).toContain('tier');

    type State = ReturnType<typeof hub.resolve>;
    type Pro = Extract<State, { tier: 'pro' }>;
    type _proKeys = Assert<Equals<keyof Pro, 'tier' | 'steps' | 'seed'>>;
    type _free = Assert<Equals<Extract<State, { tier: 'free' }>['steps'], number>>;
  });

  it('emit: false keeps the tag in state (still scoping) but off the wire', () => {
    const quiet = branch('tier', (ext: Ext) => ext.tier, { free, pro }, { emit: false });
    const result = quiet.parse({}, { tier: 'pro' });
    if (!result.success) throw new Error('unexpected');
    expect((result.state as { tier: string }).tier).toBe('pro');
    expect(result.data).not.toHaveProperty('tier');
  });

  it('merges a shared prefix effect ONCE across members', () => {
    const shared = defineGraph<Ext>()
      .field('steps', slider({ min: 1, max: 50, default: 25 }))
      .effect({ steps: () => undefined });
    const a = shared.field('seed', slider({ min: 0, max: 10, default: 0 }));
    const b = shared.field('cfg', slider({ min: 0, max: 10, default: 5 }));
    const twoWays = branch('way', (ext: Ext) => (ext.tier === 'pro' ? 'a' : 'b'), { a, b });
    expect(twoWays.effects).toHaveLength(1);
  });
});

describe('member-effect scoping reads the tag, not pick(ext)', () => {
  type HubExt = { eco: string };
  const a = defineGraph<HubExt>()
    .field('x', slider({ min: 0, max: 99, default: 1 }))
    .effect({ x: (x) => (x === 9 ? { x: 1 } : undefined) });
  const b = defineGraph<HubExt>().field('x', slider({ min: 0, max: 99, default: 2 }));
  const hub = branch('member', (ext: HubExt) => (ext.eco.startsWith('A') ? 'a' : 'b'), { a, b });

  it('fires under a mounting form whose ext is NOT the hub ext', () => {
    // the video-hub shape: the form ext lacks what pick reads; the resolver
    // adapts it. Scoping must come from the stamped tag in state.
    const form = defineForm({
      defs: hub.defs,
      reconcile: [...hub.effects],
      resolve: (f: Fields, ext: { region: string }) =>
        hub.resolve(f, { eco: ext.region === 'us' ? 'A1' : 'B1' }),
    });
    const store = form.createStore({ ext: { region: 'us' } });
    store.set({ x: 9 });
    expect(store.getState()).toEqual({ member: 'a', x: 1 }); // the a rule fired

    const other = form.createStore({ ext: { region: 'eu' } });
    other.set({ x: 9 });
    expect(other.getState()).toEqual({ member: 'b', x: 9 }); // scoped out
  });
});
