import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { enumOf, textOf } from '../def-helpers.js';
import { branch, defineGraph } from '../graph.js';

/**
 * validate(keys) — wizard step boundaries (proposal-0.4.md §3). Judges only
 * the named fields; a step's "Next" must not surface a later step's
 * submit-time requireds, and must not clear their already-surfaced errors.
 */

const required = (message: string) => ({
  input: z.string().optional(),
  output: z.string().min(1, message),
  default: '',
});

const wizard = defineGraph()
  .field('name', required('Name is required'))
  .field('email', required('Email is required'))
  .field('prompt', textOf({ default: '' }));

describe('validate(keys)', () => {
  it('judges only the named fields — a later step stays unscolded', () => {
    const store = wizard.createStore();
    const result = store.validate('name');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.errors)).toEqual(['name']);
    }
    expect(store.getField('name')?.error?.message).toBe('Name is required');
    expect(store.getField('email')?.error).toBeUndefined();
  });

  it('a key list is a step; a green step passes while a later one would fail', () => {
    const store = wizard.createStore();
    store.set({ name: 'ada' });
    expect(store.validate(['name', 'prompt']).success).toBe(true);
    expect(store.validate().success).toBe(false); // email still fails at submit
  });

  it('re-judging a scoped key clears its surfaced error without touching others', () => {
    const store = wizard.createStore();
    expect(store.validate().success).toBe(false); // surfaces name AND email
    store.set({ name: 'ada' });
    expect(store.validate('name').success).toBe(true);
    expect(store.getField('name')?.error).toBeUndefined();
    // email's surfaced error was not this validation's to clear
    expect(store.getField('email')?.error?.message).toBe('Email is required');
  });

  it('an inactive key is vacuously valid — a step whose fields left the branch gates nothing', () => {
    const s3 = defineGraph().field('bucket', required('Bucket is required'));
    const email = defineGraph().field('recipient', textOf({ default: '' }));
    const hub = defineGraph()
      .field(
        'destination',
        enumOf({
          options: [
            { value: 's3', label: 'S3' },
            { value: 'email', label: 'Email' },
          ],
          default: 'email',
        })
      )
      .use(
        branch('destination', [
          [['s3'], s3],
          [['email'], email],
        ] as const)
      );
    const store = hub.createStore();
    // 'bucket' is in the registry (typed, no cast) but inactive on this branch
    expect(store.validate('bucket').success).toBe(true);
    store.set({ destination: 's3' });
    expect(store.validate('bucket').success).toBe(false);
  });

  it('the scoped result carries no data — its success vouches only for the named fields', () => {
    const store = wizard.createStore();
    store.set({ name: 'ada' });
    const scoped = store.validate('name');
    expect(scoped.success).toBe(true);
    expect('data' in scoped).toBe(false);
  });

  it('an external error on a scoped key fails the scope; one outside it does not', () => {
    const store = wizard.createStore();
    store.set({ name: 'ada' });
    store.setError('prompt', { message: 'refused' });
    expect(store.validate('name').success).toBe(true);
    const result = store.validate(['name', 'prompt']);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.prompt?.message).toBe('refused');
  });

  it('a scoped validate keeps a standing external error on ANOTHER key visible on the snapshot', () => {
    const store = wizard.createStore();
    store.set({ name: 'ada' });
    store.setError('prompt', { message: 'refused' });
    store.validate('name');
    // the scoped publish must merge external errors, not drop them
    expect(store.getField('prompt')?.error?.message).toBe('refused');
  });

  it('errors key by GRAPH name: an emit-renamed field fails its scoped validate AND shows on the snapshot', () => {
    const renamed = defineGraph().field('engine', {
      ...required('Engine is required'),
      emit: 'engineWire',
    });
    const store = renamed.createStore();
    const result = store.validate('engine');
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(result.errors)).toEqual(['engine']);
    expect(store.getField('engine')?.error?.message).toBe('Engine is required');
    // and a scoped pass can CLEAR what it surfaced
    store.set({ engine: 'kohya' });
    expect(store.validate('engine').success).toBe(true);
    expect(store.getField('engine')?.error).toBeUndefined();
  });

  it('a field whose wire name a computed claims still fails its own scoped validate', () => {
    const shadowed = defineGraph()
      .field('ecosystem', required('Pick an ecosystem'))
      .computed('backendEcosystem', ({ ecosystem }) => `wan-${ecosystem}`, {
        emit: 'ecosystem',
      });
    const store = shadowed.createStore();
    const result = store.validate('ecosystem');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.ecosystem?.message).toBe('Pick an ecosystem');
    expect(store.getField('ecosystem')?.error?.message).toBe('Pick an ecosystem');
  });
});
