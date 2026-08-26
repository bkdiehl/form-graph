import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { codec, defineForm, type Fields } from '../index.js';
import { defaultExt, miniForm } from '../../__fixtures__/mini-generation.js';

/**
 * The "same guaranteed output on client and server" property. Both sides run the
 * same resolve + validate pipeline; the server just starts from raw input instead
 * of accumulated intent.
 */
describe('parse (server entry point)', () => {
  it('accepts raw input and returns the validated output view', () => {
    const result = miniForm.parse({ prompt: 'a cat', steps: 30 }, defaultExt);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({ prompt: 'a cat', steps: 30, ecosystem: 'Flux' });
    }
  });

  it('reports output-schema failures as field errors', () => {
    const result = miniForm.parse({ prompt: '' }, defaultExt);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.prompt?.message).toBe('Prompt is required');
  });

  it('applies the same boundary migrations the client applies', () => {
    const result = miniForm.parse({ workflow: 'txt2img:draft', prompt: 'a cat' }, defaultExt);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.workflow).toBe('image:draft');
  });

  it('enforces ext-derived limits server-side', () => {
    const result = miniForm.parse(
      { prompt: 'a cat', resources: ['a', 'b', 'c', 'd', 'e'] },
      defaultExt
    );

    expect(result.success).toBe(true);
    // data is the typed union now — narrow before touching branch-only fields.
    if (result.success && 'resources' in result.data) {
      expect(result.data.resources).toEqual(['a', 'b', 'c']);
    } else {
      throw new Error('expected a branch with resources');
    }
  });

  it('does not leak fields from inactive branches into the payload', () => {
    const result = miniForm.parse(
      { prompt: 'a cat', workflow: 'image:upscale', steps: 40, resources: ['a'] },
      defaultExt
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('steps');
      expect(result.data).not.toHaveProperty('resources');
      expect(result.data).toHaveProperty('upscaler');
    }
  });

  it('matches what the client store would submit for the same choices', () => {
    const store = miniForm.createStore({ ext: defaultExt });
    store.set({ prompt: 'a cat', steps: 30, aspectRatio: '16:9' });

    const clientOutput = store.output();
    const server = miniForm.parse(store.getIntent(), defaultExt);

    expect(server.success).toBe(true);
    if (server.success) expect(server.data).toEqual(clientOutput);
  });

  it('parsePartial returns valid fields alongside the failures', () => {
    const { data, errors } = miniForm.parsePartial({ steps: 30 }, defaultExt);

    expect((data as { steps?: number }).steps).toBe(30);
    expect(data).not.toHaveProperty('prompt');
    expect(errors.prompt).toBeDefined();
  });

  it('is stateless across calls', () => {
    const steps = (result: ReturnType<typeof miniForm.parse>) =>
      result.success && 'steps' in result.data ? result.data.steps : undefined;

    expect(steps(miniForm.parse({ prompt: 'a cat', steps: 40 }, defaultExt))).toBe(40);
    expect(steps(miniForm.parse({ prompt: 'a dog' }, defaultExt))).toBe(25);
  });
});

describe('field errors carry EVERY issue, with paths', () => {
  const ITEMS = codec({
    input: z.unknown(), // passthrough: this test is about the OUTPUT schema surfacing every issue
    output: z.array(z.object({ id: z.number() })),
    default: [],
  });

  it('an array field with several invalid items reports each one, addressable by path', () => {
    const form = defineForm()({
      resolve: (f: Fields) => ({ items: f.field('items', ITEMS) }),
    });
    const result = form.parse({ items: [{ id: 'x' }, { id: 2 }, { id: null }] }, undefined);

    expect(result.success).toBe(false);
    if (result.success) return;
    const error = result.errors.items!;
    expect(error.issues).toHaveLength(2);
    expect(error.issues.map((issue) => issue.path)).toEqual([
      [0, 'id'],
      [2, 'id'],
    ]);
    expect(error.message).toBe(error.issues[0]!.message);
  });
});
