import { describe, expect, it } from 'vitest';
import {
  allPossibleKeys,
  enumerateBranches,
  hasField,
  optionsFor,
  whereFieldExists,
} from '../index.js';
import { defaultExt, miniForm } from '../../__fixtures__/mini-generation.js';

/**
 * The capability the resolver model trades away by making definitions code
 * rather than data. v1 answers these by walking graph structure; here they are
 * answered by executing resolvers over the options the form already publishes.
 *
 * The real surface being replaced is small: `workflowHasNode` (2 call sites in
 * one hook) and `getWorkflowsForMediaType`, which is built on it.
 */

const AXES = ['workflow', 'ecosystem'] as const;

describe('hasField — the workflowHasNode equivalent', () => {
  it('answers with unpinned discriminators resolved to their defaults', () => {
    // Default ecosystem (Flux, standard mode) has steps and resources.
    expect(hasField(miniForm, 'steps', { workflow: 'image:create' }, defaultExt)).toBe(true);
    expect(hasField(miniForm, 'resources', { workflow: 'image:create' }, defaultExt)).toBe(true);
  });

  it('reports fields absent from a branch', () => {
    expect(hasField(miniForm, 'resources', { workflow: 'image:upscale' }, defaultExt)).toBe(false);
    expect(hasField(miniForm, 'ecosystem', { workflow: 'image:upscale' }, defaultExt)).toBe(false);
    expect(hasField(miniForm, 'upscaler', { workflow: 'image:upscale' }, defaultExt)).toBe(true);
  });

  it('sees through a computed-driven nested branch', () => {
    const pins = { workflow: 'image:create', ecosystem: 'Flux' };

    expect(hasField(miniForm, 'steps', { ...pins, model: 'flux-standard' }, defaultExt)).toBe(true);
    // Draft mode genuinely drops steps/resources.
    expect(hasField(miniForm, 'steps', { ...pins, model: 'flux-draft' }, defaultExt)).toBe(false);
  });

  it('evaluates real conditions rather than guessing at them', () => {
    // cfgScale is conditional on workflow inside the SD branch — the kind of
    // `when` that v1's structural walk has to approximate with try/catch.
    expect(hasField(miniForm, 'cfgScale', { ecosystem: 'SD' }, defaultExt)).toBe(true);
    expect(
      hasField(miniForm, 'cfgScale', { ecosystem: 'SD', workflow: 'image:draft' }, defaultExt)
    ).toBe(false);
  });
});

describe('enumerateBranches', () => {
  it('expands each axis over the options the form publishes', () => {
    const branches = enumerateBranches(miniForm, AXES, defaultExt);

    // 3 ecosystem-bearing workflows x 2 ecosystems, plus upscale (no ecosystem axis).
    expect(branches).toHaveLength(7);
    expect(branches.filter((b) => b.pins.workflow === 'image:upscale')).toHaveLength(1);
  });

  it('terminates early on branches where the axis is not active', () => {
    const upscale = enumerateBranches(miniForm, AXES, defaultExt).find(
      (b) => b.pins.workflow === 'image:upscale'
    );

    expect(upscale?.pins).not.toHaveProperty('ecosystem');
    expect(upscale?.keys).toContain('upscaler');
  });

  it('reads candidate values from meta.options', () => {
    expect(optionsFor(miniForm, 'ecosystem', {}, defaultExt)).toEqual(['Flux', 'SD']);
    expect(optionsFor(miniForm, 'workflow', {}, defaultExt)).toEqual([
      'image:create',
      'image:draft',
      'image:upscale',
      'video:create',
    ]);
  });
});

describe('whereFieldExists — the findKeyInBranches equivalent', () => {
  it('finds every combination containing a field', () => {
    const found = whereFieldExists(miniForm, 'resources', AXES, defaultExt);

    expect(found.length).toBeGreaterThan(0);
    // resources is Flux-standard-only, so never under SD or upscale.
    expect(found.every((b) => b.pins.ecosystem === 'Flux')).toBe(true);
    expect(found.some((b) => b.pins.workflow === 'image:upscale')).toBe(false);
  });

  it('drives a "which workflows support X" question', () => {
    const workflows = new Set(
      whereFieldExists(miniForm, 'sampler', AXES, defaultExt).map((b) => b.pins.workflow)
    );

    // sampler is SD-only but every ecosystem-bearing workflow can reach SD.
    expect(workflows).toEqual(new Set(['image:create', 'image:draft', 'video:create']));
  });

  it('returns nothing for a field that exists nowhere', () => {
    expect(whereFieldExists(miniForm, 'nonexistent', AXES, defaultExt)).toEqual([]);
  });
});

describe('allPossibleKeys', () => {
  it('collects the union of every reachable branch', () => {
    const keys = allPossibleKeys(miniForm, AXES, defaultExt);

    for (const key of ['workflow', 'prompt', 'ecosystem', 'sampler', 'resources', 'upscaler']) {
      expect(keys).toContain(key);
    }
  });
});

describe('cost', () => {
  it('enumerates the whole space fast enough to compute eagerly', () => {
    const started = performance.now();
    for (let i = 0; i < 20; i++) enumerateBranches(miniForm, AXES, defaultExt);
    const perRun = (performance.now() - started) / 20;

    // v1 caches workflowHasNode per (workflow, nodeKey); this is cheap enough
    // that the same cache is an optimisation rather than a necessity.
    expect(perRun).toBeLessThan(50);
  });
});
