import { bench, describe } from 'vitest';
import { z } from 'zod';
import { codec, defineForm, enumerateBranches, hasField, type Fields } from '../core/index.js';
import { defaultExt, miniForm } from '../__fixtures__/mini-generation.js';

/**
 * Answers the open question from docs/data-graph-rethink.md: what does a full
 * recompute actually cost on the keystroke path?
 *
 * `pnpm bench`
 */

type HeavyExt = { limits: { maxResources: number } };

const num = (def: number) =>
  codec<number, { min: number; max: number }>({
    output: z.number().min(0).max(1000),
    input: z.coerce.number().optional(),
    default: def,
    meta: { min: 0, max: 1000 },
  });

const text = (def: string) =>
  codec<string>({ output: z.string(), input: z.coerce.string().optional(), default: def });

/** ~35 active fields with a nested branch — heavier than any real ecosystem. */
function resolveHeavy(f: Fields, ext: HeavyExt) {
  const prompt = f.field('prompt', text(''));
  const mode = f.field('mode', codec<string>({ output: z.enum(['a', 'b']), default: 'a' }));

  for (let i = 0; i < 20; i++) f.field(`slider${i}`, num(i));
  for (let i = 0; i < 5; i++) f.field(`text${i}`, text(`v${i}`));

  let resources = f.field(
    'resources',
    codec<string[], { limit: number }>({ output: z.array(z.string()), default: [] }),
    { meta: { limit: ext.limits.maxResources } }
  );
  if (resources.length > ext.limits.maxResources) {
    resources = f.correct('resources', resources.slice(0, ext.limits.maxResources), 'over_limit');
  }
  f.computed('resourceCount', resources.length);

  if (mode === 'a') {
    for (let i = 0; i < 8; i++) f.field(`aOnly${i}`, num(i));
    return { prompt, mode: 'a' as const, resources };
  }
  for (let i = 0; i < 8; i++) f.field(`bOnly${i}`, text(`b${i}`));
  return { prompt, mode: 'b' as const, resources };
}

// Same 35 fields, but every codec is built ONCE at module scope instead of on
// each pass. Isolates schema *construction* cost from schema *execution* cost.
const HOISTED_SLIDERS = Array.from({ length: 20 }, (_, i) => num(i));
const HOISTED_TEXTS = Array.from({ length: 5 }, (_, i) => text(`v${i}`));
const HOISTED_A = Array.from({ length: 8 }, (_, i) => num(i));
const HOISTED_B = Array.from({ length: 8 }, (_, i) => text(`b${i}`));
const HOISTED_MODE = codec<string>({ output: z.enum(['a', 'b']), default: 'a' });
const HOISTED_PROMPT = text('');
const HOISTED_RESOURCES = codec<string[], { limit: number }>({
  output: z.array(z.string()),
  default: [],
});

function resolveHoisted(f: Fields, ext: HeavyExt) {
  const prompt = f.field('prompt', HOISTED_PROMPT);
  const mode = f.field('mode', HOISTED_MODE);

  for (let i = 0; i < 20; i++) f.field(`slider${i}`, HOISTED_SLIDERS[i]!);
  for (let i = 0; i < 5; i++) f.field(`text${i}`, HOISTED_TEXTS[i]!);

  let resources = f.field('resources', HOISTED_RESOURCES, {
    meta: { limit: ext.limits.maxResources },
  });
  if (resources.length > ext.limits.maxResources) {
    resources = f.correct('resources', resources.slice(0, ext.limits.maxResources), 'over_limit');
  }
  f.computed('resourceCount', resources.length);

  if (mode === 'a') {
    for (let i = 0; i < 8; i++) f.field(`aOnly${i}`, HOISTED_A[i]!);
    return { prompt, mode: 'a' as const, resources };
  }
  for (let i = 0; i < 8; i++) f.field(`bOnly${i}`, HOISTED_B[i]!);
  return { prompt, mode: 'b' as const, resources };
}

const heavyForm = defineForm<HeavyExt>()({ resolve: resolveHeavy });
const hoistedForm = defineForm<HeavyExt>()({ resolve: resolveHoisted });
const heavyExt: HeavyExt = { limits: { maxResources: 5 } };

// warnOnCodecChurn off: churning is this fixture's PURPOSE (it measures the cost).
const heavyStore = heavyForm.createStore({ ext: heavyExt, warnOnCodecChurn: false });
const hoistedStore = hoistedForm.createStore({ ext: heavyExt });
const miniStore = miniForm.createStore({ ext: defaultExt });

let n = 0;

describe('keystroke path (resolve + diff + notify)', () => {
  bench('heavy form (~35 fields), codecs built per pass', () => {
    heavyStore.set({ prompt: `a cat ${n++}` });
  });

  bench('heavy form (~35 fields), codecs hoisted', () => {
    hoistedStore.set({ prompt: `a cat ${n++}` });
  });

  bench('mini form (~9 fields): one keystroke', () => {
    miniStore.set({ prompt: `a cat ${n++}` });
  });

  bench('heavy form: keystroke that changes nothing (early-out)', () => {
    heavyStore.set({ prompt: heavyStore.getField('prompt')?.value as string });
  });
});

// --- introspection at production scale ------------------------------------
// The real generator has ~30 workflows x ~30 ecosystems. Enumeration by
// execution has to stay cheap enough to answer "does workflow X have field Y".

const WORKFLOWS = Array.from({ length: 30 }, (_, i) => `workflow${i}`);
const ECOSYSTEMS = Array.from({ length: 30 }, (_, i) => `eco${i}`);

const WORKFLOW_CODEC = codec<string, { options: string[] }>({
  output: z.string(),
  default: WORKFLOWS[0]!,
  meta: { options: WORKFLOWS },
});
const ECOSYSTEM_CODEC = codec<string, { options: string[] }>({
  output: z.string(),
  default: ECOSYSTEMS[0]!,
  meta: { options: ECOSYSTEMS },
});

const scaleForm = defineForm<void>()({
  resolve: (f: Fields) => {
    const workflow = f.field('workflow', WORKFLOW_CODEC);
    if (workflow === 'workflow29') {
      for (let i = 0; i < 6; i++) f.field(`utility${i}`, HOISTED_SLIDERS[i]!);
      return { workflow, kind: 'utility' as const };
    }

    const ecosystem = f.field('ecosystem', ECOSYSTEM_CODEC);
    for (let i = 0; i < 12; i++) f.field(`param${i}`, HOISTED_SLIDERS[i]!);
    if (ecosystem === 'eco3') f.field('special', HOISTED_TEXTS[0]!);
    return { workflow, ecosystem, kind: 'generation' as const };
  },
});

describe('introspection by execution (~30x30 branches)', () => {
  bench('enumerateBranches over both axes', () => {
    enumerateBranches(scaleForm, ['workflow', 'ecosystem'], undefined);
  });

  bench('hasField — a single workflowHasNode-style question', () => {
    hasField(scaleForm, 'special', { workflow: 'workflow1' }, undefined);
  });
});

// --- storage on the keystroke path -----------------------------------------
// The store calls save() synchronously per change. This measures what that
// costs with a serialize-per-keystroke adapter vs the debounced wrapper.
// (JSON.stringify into a map — REAL localStorage adds a synchronous disk-backed
// write on top, so the immediate number below is a floor.)

import { debouncedStorage, type StorageAdapter } from '../core/index.js';

function serializingStorage(): StorageAdapter {
  const backend = new Map<string, string>();
  return {
    load: () => ({}),
    save: (intent) => backend.set('intent', JSON.stringify(intent)),
  };
}

const immediateStore = hoistedForm.createStore({ ext: heavyExt, storage: serializingStorage() });
const debouncedStore = hoistedForm.createStore({
  ext: heavyExt,
  storage: debouncedStorage(serializingStorage(), 300),
});

describe('storage on the keystroke path (~35 fields, hoisted codecs)', () => {
  bench('no storage (baseline)', () => {
    hoistedStore.set({ prompt: `a cat ${n++}` });
  });

  bench('immediate serialize+save per keystroke', () => {
    immediateStore.set({ prompt: `a cat ${n++}` });
  });

  bench('debounced storage wrapper', () => {
    debouncedStore.set({ prompt: `a cat ${n++}` });
  });
});

import { generationForm } from '../generation/hub.js';
import { defaultExt as genExt } from '../generation/config.js';

const genStore = generationForm.createStore({ ext: genExt });
genStore.set({ ecosystem: 'SD1' }); // the heaviest branch: SD with all fields

describe('real generation form (phase 3, SD branch)', () => {
  bench('one prompt keystroke', () => {
    genStore.set({ prompt: `a cat ${n++}` });
  });

  bench('branch switch (ecosystem flux<->sd)', () => {
    genStore.set({ ecosystem: n % 2 ? 'Flux1' : 'SD1' });
    n++;
  });

  bench('server parse, cold', () => {
    generationForm.parse({ prompt: 'a cat', ecosystem: 'SD1' }, genExt);
  });
});

describe('on-demand work (NOT on the keystroke path)', () => {
  bench('heavy form: validate() — every output schema', () => {
    heavyStore.validate();
  });

  bench('heavy form: parse() — server entry, cold', () => {
    heavyForm.parse({ prompt: 'a cat', mode: 'a' }, heavyExt);
  });
});
