import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineGraph } from '../graph.js';
import { textOf } from '../def-helpers.js';

// `input` is OPTIONAL on a definition. Omitted, the UNTRUSTED boundary
// (storage reload, raw server input, URL params) parses with the OUTPUT
// schema, leniently: failure falls back to the default, with the error
// recorded. Live typing is unaffected either way — session set() writes
// TRUSTED intent, which never passes the input schema. So the only thing an
// explicit lenient input buys a plain field is restoring INVALID persisted
// intermediates across reload; its real jobs are coercion and migration.

describe('omitted input: lenient output-schema boundary', () => {
  const graph = defineGraph().field('level', {
    output: z.enum(['low', 'high']),
    default: 'low' as const,
  });

  it('accepts values the output accepts', () => {
    const store = graph.createStore();
    store.set({ level: 'high' });
    expect(store.getState()).toEqual({ level: 'high' });
  });

  it('falls back to the default on values the output rejects', () => {
    const result = graph.parse({ level: 'garbage' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ level: 'low' });
  });
});

describe('live typing is TRUSTED — the input schema never touches it', () => {
  it('a half-typed invalid value is held with or without an input schema', () => {
    const bare = defineGraph().field('email', {
      output: z.string().email('A valid email is required'),
      default: '',
    });
    const store = bare.createStore();
    store.set({ email: 'ab' }); // mid-typing, not a valid email yet
    expect(store.getField('email')?.value).toBe('ab'); // HELD
    expect(store.validate().success).toBe(false); // rejected only at submit
  });
});

describe('what a lenient input actually buys: restoring invalid persisted values', () => {
  it('omitted input: a stored half-typed value falls to the default on the raw boundary', () => {
    const bare = defineGraph().field('email', {
      output: z.string().email(),
      default: '',
    });
    const result = bare.parsePartial({ email: 'ab' });
    expect(result.state.email).toBe(''); // boundary dropped it
  });

  it('textOf({ output }): the lenient input restores it, strict output still refuses', () => {
    const held = defineGraph().field(
      'email',
      textOf({ output: z.string().email('A valid email is required') })
    );
    const result = held.parsePartial({ email: 'ab' });
    expect(result.state.email).toBe('ab'); // restored
    expect(Object.keys(result.errors)).toContain('email'); // still not submittable
  });
});
