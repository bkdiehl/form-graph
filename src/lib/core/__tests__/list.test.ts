import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { enumOf, textOf } from '../def-helpers.js';
import { branch, defineGraph } from '../graph.js';
import { list } from '../list.js';

/**
 * list() — the collection combinator, engine layers (proposal-0.4.md §1):
 * per-element resolution under dotted path keys, deterministic seed
 * membership, per-element errors, data assembly with member wire semantics,
 * and persistence round-trips through path-keyed intent.
 */

const runGraph = defineGraph<{ tier?: string }>()
  .field(
    'engine',
    enumOf({
      options: [
        { value: 'kohya', label: 'Kohya' },
        { value: 'musubi', label: 'Musubi' },
      ],
      default: 'kohya',
    })
  )
  .field('epochs', {
    input: z.coerce.number().optional(),
    output: z.number().min(1).max(20),
    default: 5,
  })
  .computed('label', ({ engine, epochs }) => `${engine}:${epochs}`);

const training = defineGraph<{ tier?: string }>()
  .field('triggerWord', textOf({ default: '' }))
  .use(list('runs', runGraph, { min: 1, max: 5 }));

describe('list(): resolution', () => {
  it('seeds min elements deterministically and resolves each through the member graph', () => {
    const store = training.createStore({ ext: {} });
    const state = store.getState() as { runs: Array<{ engine: string; epochs: number }> };
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]).toEqual({ engine: 'kohya', epochs: 5, label: 'kohya:5' });
    // element records live FLAT under path keys
    expect(store.getField('runs[s0].engine')?.value).toBe('kohya');
    expect(store.getField('runs[s0].label')?.value).toBe('kohya:5');
  });

  it('a path-keyed set() writes one element without touching siblings', () => {
    const store = training.createStore({
      ext: {},
      storage: { load: () => ({ runs: ['s0', 's1'] }), save: () => undefined },
    });
    store.set({ 'runs[s1].engine': 'musubi' });
    const state = store.getState() as { runs: Array<{ engine: string; label: string }> };
    expect(state.runs[0].engine).toBe('kohya');
    expect(state.runs[1].engine).toBe('musubi');
    expect(state.runs[1].label).toBe('musubi:5');
  });

  it('parsed data assembles per-element member DATA in membership order', () => {
    const store = training.createStore({
      ext: {},
      storage: { load: () => ({ runs: ['s0', 's1'], 'runs[s1].epochs': 9 }), save: () => undefined },
    });
    const result = store.validate();
    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as { runs: Array<Record<string, unknown>> };
      expect(data.runs).toHaveLength(2);
      expect(data.runs[0]).toEqual({ engine: 'kohya', epochs: 5, label: 'kohya:5' });
      expect(data.runs[1].epochs).toBe(9);
      // membership ids never reach the wire
      expect(JSON.stringify(data)).not.toContain('"s0"');
    }
  });

  it('an element error keys by its full path and fails validate without blaming siblings', () => {
    const store = training.createStore({
      ext: {},
      storage: { load: () => ({ runs: ['s0', 's1'] }), save: () => undefined },
    });
    store.set({ 'runs[s1].epochs': 99 }); // out of range, held as trusted intent
    const result = store.validate();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.errors)).toEqual(['runs[s1].epochs']);
    }
    expect(store.getField('runs[s1].epochs')?.error).toBeDefined();
    expect(store.getField('runs[s0].epochs')?.error).toBeUndefined();
    // the scoped form agrees, per element
    expect(store.validate('runs[s0].epochs').success).toBe(true);
    expect(store.validate('runs[s1].epochs').success).toBe(false);
  });

  it('element intent persists path-keyed and round-trips into a fresh store', () => {
    let saved: Record<string, unknown> = {};
    const first = training.createStore({
      ext: {},
      storage: { load: () => ({}), save: (record) => void (saved = record) },
    });
    first.set({ 'runs[s0].engine': 'musubi', triggerWord: 'ohwx' });
    expect(saved['runs[s0].engine']).toBe('musubi');

    const second = training.createStore({
      ext: {},
      storage: { load: () => saved, save: () => undefined },
    });
    const state = second.getState() as { runs: Array<{ engine: string }> };
    expect(state.runs[0].engine).toBe('musubi'); // seed ids are stable across sessions
  });

  it('member branches work per element — two elements on different arms', () => {
    const kohyaArm = defineGraph().field('lr', textOf({ default: '1e-4' }));
    const musubiArm = defineGraph().field('blocks', textOf({ default: 'all' }));
    const branchy = defineGraph()
      .field(
        'engine',
        enumOf({
          options: [
            { value: 'kohya', label: 'K' },
            { value: 'musubi', label: 'M' },
          ],
          default: 'kohya',
        })
      )
      .use(
        branch('engine', [
          [['kohya'], kohyaArm],
          [['musubi'], musubiArm],
        ] as const)
      );
    const host = defineGraph().use(list('runs', branchy, { min: 2, max: 4 }));
    const store = host.createStore();
    store.set({ 'runs[s1].engine': 'musubi' });
    const state = store.getState() as { runs: Array<Record<string, unknown>> };
    expect(state.runs[0]).toMatchObject({ engine: 'kohya', lr: '1e-4' });
    expect(state.runs[1]).toMatchObject({ engine: 'musubi', blocks: 'all' });
    expect(store.getField('runs[s0].lr')?.value).toBe('1e-4');
    expect(store.getField('runs[s1].blocks')?.value).toBe('all');
    expect(store.getField('runs[s1].lr')).toBeNull();
  });

  it('lists nest: a member graph can hold its own list', () => {
    const step = defineGraph().field('name', textOf({ default: 'step' }));
    const stage = defineGraph()
      .field('title', textOf({ default: 't' }))
      .use(list('steps', step, { min: 2 }));
    const host = defineGraph().use(list('stages', stage, { min: 1 }));
    const store = host.createStore();
    const state = store.getState() as {
      stages: Array<{ title: string; steps: Array<{ name: string }> }>;
    };
    expect(state.stages[0].steps).toHaveLength(2);
    expect(store.getField('stages[s0].steps[s1].name')?.value).toBe('step');
    store.set({ 'stages[s0].steps[s1].name': 'inner edit' });
    const result = store.validate();
    if (!result.success) throw new Error('unexpected');
    const data = result.data as { stages: Array<{ steps: Array<{ name: string }> }> };
    expect(data.stages[0].steps[1].name).toBe('inner edit');
  });

  it('a tampered membership (bounds, duplicates) is corrected with a note, not obeyed', () => {
    const store = training.createStore({
      ext: {},
      storage: {
        load: () => ({ runs: ['a', 'a', 'b', 'c', 'd', 'e', 'f'] }),
        save: () => undefined,
      },
    });
    const state = store.getState() as { runs: unknown[] };
    expect(state.runs.length).toBeLessThanOrEqual(5); // max clamp
    expect(store.getNotes().some((n) => n.kind === 'list_bounds')).toBe(true);
  });
});

describe('list(): store ops', () => {
  const make = (stored: Record<string, unknown> = {}) => {
    let saved: Record<string, unknown> = {};
    const store = training.createStore({
      ext: {},
      storage: { load: () => stored, save: (record) => void (saved = record) },
    });
    return { store, saved: () => saved };
  };

  it('add appends a minted element (seedable); max refuses', () => {
    const { store } = make({ runs: ['s0', 's1', 's2', 's3'] });
    const added = store.list('runs').add({ engine: 'musubi' });
    if (!added.success) throw new Error('unexpected refusal');
    expect(store.list('runs').ids).toHaveLength(5);
    expect(store.getField(`runs[${added.id}].engine`)?.value).toBe('musubi');

    const refused = store.list('runs').add();
    expect(refused).toEqual({ success: false, reason: 'max' });
    expect(store.list('runs').ids).toHaveLength(5);
  });

  it('remove refuses at min and for unknown ids; otherwise sweeps the element subtree', () => {
    const { store, saved } = make({ runs: ['s0', 's1'], 'runs[s1].epochs': 9 });
    expect(store.list('runs').remove('nope')).toEqual({ success: false, reason: 'unknown_id' });

    expect(store.list('runs').remove('s1')).toEqual({ success: true });
    expect(store.list('runs').ids).toEqual(['s0']);
    expect(store.getField('runs[s1].epochs')).toBeNull();
    expect(JSON.stringify(saved())).not.toContain('runs[s1]');

    expect(store.list('runs').remove('s0')).toEqual({ success: false, reason: 'min' });
  });

  it('remove drops the element external error with the element', () => {
    const { store } = make({ runs: ['s0', 's1'] });
    store.setError('runs[s1].epochs', { message: 'cost check failed' });
    expect(store.validate().success).toBe(false);
    store.list('runs').remove('s1');
    expect(store.validate().success).toBe(true);
  });

  it('duplicate copies the USER-WRITTEN entries; derived values re-derive', () => {
    const { store } = make();
    store.set({ 'runs[s0].engine': 'musubi' }); // a choice
    // epochs stays an adopted default (5)
    const result = store.list('runs').duplicate('s0');
    if (!result.success) throw new Error('unexpected refusal');
    expect(store.getField(`runs[${result.id}].engine`)?.value).toBe('musubi'); // copied
    expect(store.getField(`runs[${result.id}].epochs`)?.value).toBe(5); // re-derived
    expect(store.list('runs').ids[1]).toBe(result.id); // inserted after its source
  });

  it('move reorders membership only — element values follow their ids', () => {
    const { store } = make({ runs: ['s0', 's1'], 'runs[s1].epochs': 9 });
    expect(store.list('runs').move('s1', 0)).toEqual({ success: true });
    expect(store.list('runs').ids).toEqual(['s1', 's0']);
    const state = store.getState() as { runs: Array<{ epochs: number }> };
    expect(state.runs[0].epochs).toBe(9);
    expect(state.runs[1].epochs).toBe(5);
  });

  it('ops persist: membership and seeds land in storage as durable intent', () => {
    const { store, saved } = make();
    const added = store.list('runs').add({ epochs: 12 });
    if (!added.success) throw new Error('unexpected refusal');
    expect(saved().runs).toEqual(['s0', added.id]);
    expect(saved()[`runs[${added.id}].epochs`]).toBe(12);
  });

  it('an inactive key throws — the ops handle never dangles', () => {
    const { store } = make();
    expect(() => store.list('nope' as never)).toThrow(/no active list/);
  });
});

describe('list(): review-round pins', () => {
  it("validate('runs') judges the WHOLE list — every element, nested included", () => {
    const store = training.createStore({
      ext: {},
      storage: { load: () => ({ runs: ['s0', 's1'] }), save: () => undefined },
    });
    store.set({ 'runs[s1].epochs': 99 }); // invalid, held as intent
    const result = store.validate('runs');
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(result.errors)).toEqual(['runs[s1].epochs']);
    // and an external error against an element fails the list scope too
    store.set({ 'runs[s1].epochs': 5 });
    store.setError('runs[s0].engine', { message: 'refused' });
    expect(store.validate('runs').success).toBe(false);
  });

  it('remove/duplicate touch ONLY the current scope bucket — sibling buckets keep their memory', () => {
    const scopedHost = defineGraph<{ family: string }>({ scope: (ext) => ext.family }).use(
      list('runs', runGraph, { min: 1, max: 5 })
    );
    let record: Record<string, unknown> = {};
    const storage = { load: () => record, save: (r: Record<string, unknown>) => void (record = r) };

    const inX = scopedHost.createStore({ ext: { family: 'X' }, storage });
    inX.list('runs').add(); // X: [s0, minted]
    const minted = inX.list('runs').ids[1];
    inX.set({ [`runs[${minted}].epochs`]: 9 });

    const inY = scopedHost.createStore({ ext: { family: 'Y' }, storage });
    // Y shares the deterministic seed id s0 with X
    inY.set({ 'runs[s0].epochs': 7 });
    record = { ...record, ...Object.fromEntries(Object.entries(record)) };

    // removing s0 in X must not destroy Y's s0 memory
    const back = scopedHost.createStore({ ext: { family: 'X' }, storage });
    expect(back.list('runs').remove('s0')).toEqual({ success: true });
    expect(record['runs[s0].epochs@Y']).toBe(7); // Y's bucket untouched

    const yAgain = scopedHost.createStore({ ext: { family: 'Y' }, storage });
    expect(yAgain.getField('runs[s0].epochs')?.value).toBe(7);
  });

  it('duplicate copies only the current bucket — no orphan entries in siblings', () => {
    const scopedHost = defineGraph<{ family: string }>({ scope: (ext) => ext.family }).use(
      list('runs', runGraph, { min: 1, max: 5 })
    );
    let record: Record<string, unknown> = {};
    const storage = { load: () => record, save: (r: Record<string, unknown>) => void (record = r) };

    const inY = scopedHost.createStore({ ext: { family: 'Y' }, storage });
    inY.set({ 'runs[s0].epochs': 7 });
    const inX = scopedHost.createStore({ ext: { family: 'X' }, storage });
    inX.set({ 'runs[s0].epochs': 9 });
    const dup = inX.list('runs').duplicate('s0');
    if (!dup.success) throw new Error('unexpected refusal');
    expect(record[`runs[${dup.id}].epochs@X`]).toBe(9);
    expect(record[`runs[${dup.id}].epochs@Y`]).toBeUndefined(); // no orphan in Y
  });

  it('duplicate inserts AFTER its source, not at the end', () => {
    const store = training.createStore({
      ext: {},
      storage: { load: () => ({ runs: ['s0', 's1'] }), save: () => undefined },
    });
    const dup = store.list('runs').duplicate('s0');
    if (!dup.success) throw new Error('unexpected refusal');
    expect(store.list('runs').ids).toEqual(['s0', dup.id, 's1']);
  });

  it('a stored membership BELOW min is padded back with a note', () => {
    const host = defineGraph().use(list('runs', runGraph, { min: 2, max: 5 }));
    const store = host.createStore({
      storage: { load: () => ({ runs: ['only'] }), save: () => undefined },
    });
    expect(store.list('runs').ids).toHaveLength(2);
    expect(store.getNotes().some((n) => n.kind === 'list_bounds')).toBe(true);
  });

  it('a field or computed claiming a list wire name throws like any duplicate wire', () => {
    const clash = defineGraph()
      .computed('derivedRuns', () => 'x', { emit: 'runs' })
      .use(list('runs', runGraph, { min: 1 }));
    const store = clash.createStore();
    expect(() => store.validate()).toThrow(/Duplicate wire key "runs"/);
  });
});
