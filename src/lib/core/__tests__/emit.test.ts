import { describe, expect, it } from 'vitest';
import { defineGraph } from '../graph.js';
import { enumOf, textOf } from '../def-helpers.js';

/**
 * `emit` is the wire-naming knob for the selection-vs-derived split: a
 * computed with `emit: 'name'` carries that wire name, and a field of the
 * same name is SHADOWED off the wire implicitly — the derived value is by
 * definition the one the wire should carry. `emit: false` remains for
 * form-only fields nothing emits over. It NEVER changes a value — it only
 * decides which keys appear in parsed data and under what names. Born from
 * civitai's Wan port, where v1 stored a derived backend target in the same
 * key as the user's selection.
 */

const SELECTION = enumOf({
  options: [
    { value: 'wan-t2v', label: 'T2V' },
    { value: 'wan-i2v', label: 'I2V' },
  ],
  default: 'wan-t2v',
});

// no emit:false on the field — the computed's emit shadows it implicitly
const graph = defineGraph()
  .field('ecosystem', SELECTION)
  .field(
    'mode',
    enumOf({
      options: [
        { value: 'text', label: 'Text' },
        { value: 'image', label: 'Image' },
      ],
      default: 'text',
    })
  )
  .computed(
    'backendEcosystem',
    ({ ecosystem, mode }) => (mode === 'image' ? 'wan-i2v' : ecosystem),
    { emit: 'ecosystem' }
  )
  // a reader of the DERIVED value must be declared after it — that ordering is
  // what replaces reactive re-evaluation
  .computed('summary', ({ backendEcosystem, mode }) => `${backendEcosystem}/${mode}`);

describe('emit: the DATA TYPE tells the wire truth', () => {
  type Assert<T extends true> = T;
  type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

  it('renamed keys appear under the wire name with the COMPUTED value type', () => {
    const result = graph.parse({ ecosystem: 'wan-t2v', mode: 'image' });
    if (!result.success) throw new Error('unexpected');
    type Data = typeof result.data;
    // the emitting computed's EXACT type rides the wire name
    type _wireEcosystem = Assert<Equals<Data['ecosystem'], 'wan-t2v' | 'wan-i2v'>>;
    // the graph-internal name is NOT in data
    type _noBackendKey = Assert<
      Equals<'backendEcosystem' extends keyof Data ? true : false, false>
    >;
    // the shadowed selection is NOT in data either — the type above already
    // proves the field's own entry is gone: data.ecosystem is the computed's
    // type, and state keeps the field under its own name
    type _state = Assert<
      Equals<
        (typeof result.state)['ecosystem'],
        'wan-t2v' | 'wan-i2v'
      >
    >;
    expect(true).toBe(true);
  });

  it('store.validate() carries the same wire-typed data', () => {
    const store = graph.createStore();
    const out = store.validate();
    if (!out.success) throw new Error('unexpected');
    type Data = typeof out.data;
    type _noBackendKey = Assert<
      Equals<'backendEcosystem' extends keyof Data ? true : false, false>
    >;
    expect((out.data as Record<string, unknown>).backendEcosystem).toBeUndefined();
    expect((out.data as Record<string, unknown>).ecosystem).toBe('wan-t2v');
  });
});

describe('emit x computedKeys: the DB-exclusion contract', () => {
  it('parse().computedKeys speaks WIRE names, so omit(data, computedKeys) stores no derivable value', () => {
    const result = graph.parse({ ecosystem: 'wan-t2v', mode: 'image' });
    if (!result.success) throw new Error('unexpected');
    // 'ecosystem' IS computed-sourced in data (backendEcosystem emits it);
    // 'backendEcosystem' is not in data and must not be listed
    expect(result.computedKeys).toContain('ecosystem');
    expect(result.computedKeys).toContain('summary');
    expect(result.computedKeys).not.toContain('backendEcosystem');

    const storable = Object.fromEntries(
      Object.entries(result.data as Record<string, unknown>).filter(
        ([key]) => !result.computedKeys?.includes(key)
      )
    );
    expect(storable).toEqual({ mode: 'image' }); // only genuine user-owned values
  });

  it("store.getComputedKeys() speaks GRAPH names — it pairs with state, not data", () => {
    const store = graph.createStore();
    expect(store.getComputedKeys()).toContain('backendEcosystem');
    expect(store.getComputedKeys()).not.toContain('ecosystem');
  });
});

describe('emit', () => {
  it('renames on the wire and hides the selection — values untouched', () => {
    const result = graph.parse({ ecosystem: 'wan-t2v', mode: 'image' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    // wire: ONE ecosystem key, carrying the derived value
    expect(result.data).toEqual({
      ecosystem: 'wan-i2v',
      mode: 'image',
      summary: 'wan-i2v/image',
    });
    // state: BOTH facts, each under its own name, neither overwritten
    expect(result.state).toMatchObject({
      ecosystem: 'wan-t2v',
      backendEcosystem: 'wan-i2v',
    });
  });

  it('in-graph readers of the derived value are ordered, so never stale', () => {
    const result = graph.parse({ ecosystem: 'wan-t2v', mode: 'image' });
    if (!result.success) throw new Error('unexpected');
    expect((result.state as { summary: string }).summary).toBe('wan-i2v/image');
  });

  it('a shadowed field still holds intent and drives the form', () => {
    const store = graph.createStore();
    store.set({ ecosystem: 'wan-i2v' });
    expect(store.getField('ecosystem')?.value).toBe('wan-i2v'); // snapshot: the selection
    expect(store.getIntent()).toHaveProperty('ecosystem'); // remembered
    const out = store.validate();
    expect(out.success && 'ecosystem' in (out.data as object)).toBe(true);
  });

  it('an emit:false field still GUARDS — its error keys by graph name', () => {
    const guarded = defineGraph().field('secret', {
      ...textOf({ required: true }),
      emit: false,
    });
    const result = guarded.parse({ secret: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(result.errors)).toEqual(['secret']);
    }
  });

  it("a computed's emit shadows the same-named field — no emit:false needed", () => {
    const shadowed = defineGraph()
      .field('a', textOf({ default: 'x' }))
      .computed('b', () => 'y', { emit: 'a' });
    const result = shadowed.parse({});
    if (!result.success) throw new Error('unexpected');
    expect(result.data).toEqual({ a: 'y' }); // wire: the derived value
    expect(result.state).toMatchObject({ a: 'x', b: 'y' }); // state: both facts
  });

  it('TWO computeds claiming one wire name is still a loud error', () => {
    const clashing = defineGraph()
      .computed('b', () => 'y', { emit: 'a' })
      .computed('c', () => 'z', { emit: 'a' });
    expect(() => clashing.parse({})).toThrow(/Duplicate wire key "a"/);
  });
});
