import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { enumOf, textOf } from '../def-helpers.js';
import { branch, defineGraph } from '../graph.js';

/**
 * setError/clearError — the door for ASYNC validity judgments into the sync
 * engine (proposal-0.4.md §2). External errors are live on the snapshot,
 * fail validate()/output(), are never persisted, and go stale exactly two
 * ways the engine owns: a user write to the field, or the field leaving the
 * active branch. Everything else is the caller's job.
 */

const s3 = defineGraph().field('bucket', textOf({ default: 'assets' }));
const email = defineGraph().field('recipient', textOf({ default: '' }));

const hub = defineGraph()
  .field(
    'destination',
    enumOf({
      options: [
        { value: 's3', label: 'S3' },
        { value: 'email', label: 'Email' },
      ],
      default: 's3',
    })
  )
  .field('prompt', textOf({ default: '' }))
  .use(
    branch('destination', [
      [['s3'], s3],
      [['email'], email],
    ] as const)
  );

describe('setError / clearError', () => {
  it('an external error is LIVE on the field snapshot, unlike a refine', () => {
    const store = hub.createStore();
    expect(store.getField('prompt')?.error).toBeUndefined();
    store.setError('prompt', { message: 'This phrase is not allowed.' });
    expect(store.getField('prompt')?.error?.message).toBe('This phrase is not allowed.');
    expect(store.getField('prompt')?.error?.code).toBe('external');
  });

  it('validate() fails while an external error stands, even with every schema green', () => {
    const store = hub.createStore();
    expect(store.validate().success).toBe(true);
    store.setError('prompt', { message: 'refused' });
    const result = store.validate();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.prompt?.message).toBe('refused');
  });

  it('output() throws while an external error stands', () => {
    const store = hub.createStore();
    store.setError('prompt', { message: 'refused' });
    expect(() => store.output()).toThrow(/prompt/);
  });

  it('a user write to the field clears its external error; a write elsewhere does not', () => {
    const store = hub.createStore();
    store.setError('prompt', { message: 'refused' });
    store.set({ bucket: 'other' });
    expect(store.getField('prompt')?.error?.message).toBe('refused');
    store.set({ prompt: 'a new attempt' });
    expect(store.getField('prompt')?.error).toBeUndefined();
    expect(store.validate().success).toBe(true);
  });

  it('a branch switch that deactivates the field drops its error for good', () => {
    const store = hub.createStore();
    store.setError('bucket', { message: 'bucket rejected' });
    expect(store.getField('bucket')?.error?.message).toBe('bucket rejected');
    store.set({ destination: 'email' });
    expect(store.getField('bucket')).toBeNull();
    // back to the branch: the judgment died with it — it can block nothing
    store.set({ destination: 's3' });
    expect(store.getField('bucket')?.error).toBeUndefined();
    expect(store.validate().success).toBe(true);
  });

  it('clearError removes the error and notifies the field subscriber', () => {
    const store = hub.createStore();
    const listener = vi.fn();
    store.subscribe('prompt', listener);
    store.setError('prompt', { message: 'refused' });
    expect(listener).toHaveBeenCalledTimes(1);
    store.clearError('prompt');
    expect(store.getField('prompt')?.error).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(2);
    // clearing a key with no external error is a no-op, not a notification
    store.clearError('prompt');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('an external error WINS over an engine error on the same key while it stands', () => {
    const strict = defineGraph().field('name', {
      input: z.string().optional(),
      output: z.string().min(1, 'Name is required'),
      default: '',
    });
    const store = strict.createStore();
    expect(store.validate().success).toBe(false);
    expect(store.getField('name')?.error?.message).toBe('Name is required');
    store.setError('name', { message: 'That name is taken.' });
    expect(store.getField('name')?.error?.message).toBe('That name is taken.');
  });

  it('reset clears external errors', () => {
    const store = hub.createStore();
    store.setError('prompt', { message: 'refused' });
    store.reset();
    expect(store.getField('prompt')?.error).toBeUndefined();
    expect(store.validate().success).toBe(true);
  });

  it('external errors never reach persisted intent', () => {
    const saved: Record<string, unknown>[] = [];
    const store = hub.createStore({
      storage: { load: () => ({}), save: (record) => void saved.push(record) },
    });
    store.setError('prompt', { message: 'refused' });
    store.set({ prompt: 'hello' });
    expect(saved.length).toBeGreaterThan(0); // the write DID save — this test saw real records
    expect(JSON.stringify(saved)).not.toContain('refused');
  });

  it('setError on an INACTIVE key blocks nothing — validate, output, and the scoped form agree', () => {
    const store = hub.createStore(); // destination: s3 — 'recipient' inactive
    store.setError('recipient', { message: 'undeliverable' });
    expect(store.validate().success).toBe(true);
    expect(() => store.output()).not.toThrow();
    expect(store.validate('recipient').success).toBe(true);
    // and it stays dead when the branch arrives later without a fresh judgment
    store.set({ destination: 'email' });
    expect(store.getField('recipient')?.error).toBeUndefined();
    expect(store.validate().success).toBe(true);
  });
});
