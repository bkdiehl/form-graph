import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { codec, type Fields } from '../index.js';
import { intentFromRaw, trustedEntry, type ParseCache } from '../intent.js';
import { resolve } from '../resolve.js';
import { defaultExt, miniForm } from '../../__fixtures__/mini-generation.js';

const intentOf = (values: Record<string, unknown>) =>
  new Map(Object.entries(values).map(([k, v]) => [k, trustedEntry(v)]));

describe('resolve', () => {
  it('falls back to codec defaults when intent is empty', () => {
    const { state } = miniForm.resolve(new Map(), defaultExt);

    expect(state).toMatchObject({
      workflow: 'image:create',
      outputType: 'image',
      prompt: '',
      ecosystem: 'Flux',
      model: 'flux-standard',
    });
  });

  it('routes into the branch selected by a parent field', () => {
    const upscale = miniForm.resolve(intentOf({ workflow: 'image:upscale' }), defaultExt);

    expect(upscale.keys).toContain('upscaler');
    expect(upscale.keys).not.toContain('ecosystem');
    expect(upscale.records.has('scale')).toBe(true);
    expect(upscale.records.has('steps')).toBe(false);
  });

  it('routes through a computed into a nested branch', () => {
    const draft = miniForm.resolve(
      intentOf({ ecosystem: 'Flux', model: 'flux-draft' }),
      defaultExt
    );

    expect(draft.state).toMatchObject({ fluxMode: 'draft' });
    // The draft branch has no steps/resources at all.
    expect(draft.keys).not.toContain('steps');
    expect(draft.keys).not.toContain('resources');
  });

  it('drops a conditional field when its condition is false', () => {
    const withCfg = miniForm.resolve(intentOf({ ecosystem: 'SD' }), defaultExt);
    const withoutCfg = miniForm.resolve(
      // image:draft reconciles model in the store, but resolve() is raw: SD + draft
      intentOf({ ecosystem: 'SD', workflow: 'image:draft' }),
      defaultExt
    );

    expect(withCfg.keys).toContain('cfgScale');
    expect(withoutCfg.keys).not.toContain('cfgScale');
  });

  it('reads dynamic meta and projection from ext', () => {
    const generous = miniForm.resolve(
      intentOf({ resources: ['a', 'b', 'c', 'd', 'e'] }),
      { ...defaultExt, limits: { maxResources: 5 } }
    );
    const stingy = miniForm.resolve(intentOf({ resources: ['a', 'b', 'c', 'd', 'e'] }), defaultExt);

    expect(generous.records.get('resources')?.meta).toEqual({ limit: 5 });
    expect(generous.records.get('resources')?.value).toHaveLength(5);
    // Projection clamps to the live limit every pass — no effect involved.
    expect(stingy.records.get('resources')?.value).toEqual(['a', 'b', 'c']);
  });

  it('records declaration order for auto-rendered forms', () => {
    const { keys } = miniForm.resolve(new Map(), defaultExt);
    expect(keys.slice(0, 3)).toEqual(['workflow', 'outputType', 'prompt']);
  });

  it('is pure: same inputs give equal output, and intent is never mutated', () => {
    const intent = intentOf({ workflow: 'image:create', steps: 30 });
    const a = miniForm.resolve(intent, defaultExt);
    const b = miniForm.resolve(intent, defaultExt);

    expect(a.state).toEqual(b.state);
    expect(intent.size).toBe(2);
  });

  it('throws when two sections declare the same key', () => {
    const dup = (f: Fields) => {
      const c = codec<number>({ output: z.number(), default: 1 });
      f.field('steps', c);
      f.field('steps', c);
      return {};
    };

    expect(() => resolve(dup, new Map(), undefined)).toThrow(/Duplicate field "steps"/);
  });
});

describe('boundary parsing', () => {
  it('migrates a renamed value through the input schema', () => {
    const { state } = miniForm.resolve(intentFromRaw({ workflow: 'txt2img:draft' }), defaultExt);
    expect(state.workflow).toBe('image:draft');
  });

  it('coerces loose boundary types (URL params arrive as strings)', () => {
    const { records } = miniForm.resolve(
      intentFromRaw({ steps: '30', seed: '12345' }),
      defaultExt
    );

    expect(records.get('steps')?.value).toBe(30);
    expect(records.get('seed')?.value).toBe(12345);
  });

  it('falls back to the default and records the error when a boundary value is invalid', () => {
    const { records } = miniForm.resolve(intentFromRaw({ steps: 'not-a-number' }), defaultExt);

    expect(records.get('steps')?.value).toBe(25);
    expect(records.get('steps')?.boundaryError).toBeDefined();
  });

  it('does not run input schemas on trusted writes', () => {
    let parses = 0;
    const counted = codec<number>({
      output: z.number(),
      input: {
        parse: (v) => v as number,
        safeParse: (v) => {
          parses++;
          return { success: true, data: v as number };
        },
      },
      default: 0,
    });
    const form = (f: Fields) => ({ n: f.field('n', counted) });

    resolve(form, new Map([['n', trustedEntry(5)]]), undefined);
    expect(parses).toBe(0);

    resolve(form, intentFromRaw({ n: 5 }), undefined);
    expect(parses).toBe(1);
  });

  it('parses a boundary value once no matter how often it is resolved', () => {
    let parses = 0;
    const counted = codec<number>({
      output: z.number(),
      input: {
        parse: (v) => v as number,
        safeParse: (v) => {
          parses++;
          return { success: true, data: v as number };
        },
      },
      default: 0,
    });
    const form = (f: Fields) => ({ n: f.field('n', counted) });

    const intent = intentFromRaw({ n: 5 });
    const cache: ParseCache = new WeakMap();
    resolve(form, intent, undefined, cache);
    resolve(form, intent, undefined, cache);
    resolve(form, intent, undefined, cache);

    expect(parses).toBe(1);
  });
});
