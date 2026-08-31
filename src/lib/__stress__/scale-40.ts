import { z } from 'zod';
import { codec } from '../core/codec.js';
import { defineForm } from '../core/form.js';
import { type Fields } from '../core/resolve.js';

/**
 * TYPE-SCALE STRESS — the analog of v1's depth-budget stress file, for the
 * opposite claim. v1 measured how many chained calls fit before TS2589; this
 * measures what a FULL-SCALE union (40 ecosystem branches, each with unique
 * fields) costs the compiler under native switch-return inference. Numbers in
 * the README. Nothing imports this file; it exists to be typechecked.
 */

type Ext = { limit: number };

const TEXT = codec<string>({ output: z.string(), default: '' });
const NUM = codec<number, { min: number; max: number }>({
  output: z.number(),
  default: 1,
  meta: { min: 0, max: 100 },
});
const FLAG = codec<boolean>({ output: z.boolean(), default: false });

function eco0(f: Fields) {
  return {
    ecosystem: 'Eco0' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle0: f.field('toggle0', FLAG),
    only0: f.field('only0', NUM),
    label0: f.field('label0', TEXT),
  };
}
function eco1(f: Fields) {
  return {
    ecosystem: 'Eco1' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle1: f.field('toggle1', FLAG),
    only1: f.field('only1', NUM),
    label1: f.field('label1', TEXT),
  };
}
function eco2(f: Fields) {
  return {
    ecosystem: 'Eco2' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle2: f.field('toggle2', FLAG),
    only2: f.field('only2', NUM),
    label2: f.field('label2', TEXT),
  };
}
function eco3(f: Fields) {
  return {
    ecosystem: 'Eco3' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle3: f.field('toggle3', FLAG),
    only3: f.field('only3', NUM),
    label3: f.field('label3', TEXT),
  };
}
function eco4(f: Fields) {
  return {
    ecosystem: 'Eco4' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle4: f.field('toggle4', FLAG),
    only4: f.field('only4', NUM),
    label4: f.field('label4', TEXT),
  };
}
function eco5(f: Fields) {
  return {
    ecosystem: 'Eco5' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle0: f.field('toggle0', FLAG),
    only5: f.field('only5', NUM),
    label5: f.field('label5', TEXT),
  };
}
function eco6(f: Fields) {
  return {
    ecosystem: 'Eco6' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle1: f.field('toggle1', FLAG),
    only6: f.field('only6', NUM),
    label6: f.field('label6', TEXT),
  };
}
function eco7(f: Fields) {
  return {
    ecosystem: 'Eco7' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle2: f.field('toggle2', FLAG),
    only7: f.field('only7', NUM),
    label7: f.field('label7', TEXT),
  };
}
function eco8(f: Fields) {
  return {
    ecosystem: 'Eco8' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle3: f.field('toggle3', FLAG),
    only8: f.field('only8', NUM),
    label8: f.field('label8', TEXT),
  };
}
function eco9(f: Fields) {
  return {
    ecosystem: 'Eco9' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle4: f.field('toggle4', FLAG),
    only9: f.field('only9', NUM),
    label9: f.field('label9', TEXT),
  };
}
function eco10(f: Fields) {
  return {
    ecosystem: 'Eco10' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle0: f.field('toggle0', FLAG),
    only10: f.field('only10', NUM),
    label10: f.field('label10', TEXT),
  };
}
function eco11(f: Fields) {
  return {
    ecosystem: 'Eco11' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle1: f.field('toggle1', FLAG),
    only11: f.field('only11', NUM),
    label11: f.field('label11', TEXT),
  };
}
function eco12(f: Fields) {
  return {
    ecosystem: 'Eco12' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle2: f.field('toggle2', FLAG),
    only12: f.field('only12', NUM),
    label12: f.field('label12', TEXT),
  };
}
function eco13(f: Fields) {
  return {
    ecosystem: 'Eco13' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle3: f.field('toggle3', FLAG),
    only13: f.field('only13', NUM),
    label13: f.field('label13', TEXT),
  };
}
function eco14(f: Fields) {
  return {
    ecosystem: 'Eco14' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle4: f.field('toggle4', FLAG),
    only14: f.field('only14', NUM),
    label14: f.field('label14', TEXT),
  };
}
function eco15(f: Fields) {
  return {
    ecosystem: 'Eco15' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle0: f.field('toggle0', FLAG),
    only15: f.field('only15', NUM),
    label15: f.field('label15', TEXT),
  };
}
function eco16(f: Fields) {
  return {
    ecosystem: 'Eco16' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle1: f.field('toggle1', FLAG),
    only16: f.field('only16', NUM),
    label16: f.field('label16', TEXT),
  };
}
function eco17(f: Fields) {
  return {
    ecosystem: 'Eco17' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle2: f.field('toggle2', FLAG),
    only17: f.field('only17', NUM),
    label17: f.field('label17', TEXT),
  };
}
function eco18(f: Fields) {
  return {
    ecosystem: 'Eco18' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle3: f.field('toggle3', FLAG),
    only18: f.field('only18', NUM),
    label18: f.field('label18', TEXT),
  };
}
function eco19(f: Fields) {
  return {
    ecosystem: 'Eco19' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle4: f.field('toggle4', FLAG),
    only19: f.field('only19', NUM),
    label19: f.field('label19', TEXT),
  };
}
function eco20(f: Fields) {
  return {
    ecosystem: 'Eco20' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle0: f.field('toggle0', FLAG),
    only20: f.field('only20', NUM),
    label20: f.field('label20', TEXT),
  };
}
function eco21(f: Fields) {
  return {
    ecosystem: 'Eco21' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle1: f.field('toggle1', FLAG),
    only21: f.field('only21', NUM),
    label21: f.field('label21', TEXT),
  };
}
function eco22(f: Fields) {
  return {
    ecosystem: 'Eco22' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle2: f.field('toggle2', FLAG),
    only22: f.field('only22', NUM),
    label22: f.field('label22', TEXT),
  };
}
function eco23(f: Fields) {
  return {
    ecosystem: 'Eco23' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle3: f.field('toggle3', FLAG),
    only23: f.field('only23', NUM),
    label23: f.field('label23', TEXT),
  };
}
function eco24(f: Fields) {
  return {
    ecosystem: 'Eco24' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle4: f.field('toggle4', FLAG),
    only24: f.field('only24', NUM),
    label24: f.field('label24', TEXT),
  };
}
function eco25(f: Fields) {
  return {
    ecosystem: 'Eco25' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle0: f.field('toggle0', FLAG),
    only25: f.field('only25', NUM),
    label25: f.field('label25', TEXT),
  };
}
function eco26(f: Fields) {
  return {
    ecosystem: 'Eco26' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle1: f.field('toggle1', FLAG),
    only26: f.field('only26', NUM),
    label26: f.field('label26', TEXT),
  };
}
function eco27(f: Fields) {
  return {
    ecosystem: 'Eco27' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle2: f.field('toggle2', FLAG),
    only27: f.field('only27', NUM),
    label27: f.field('label27', TEXT),
  };
}
function eco28(f: Fields) {
  return {
    ecosystem: 'Eco28' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle3: f.field('toggle3', FLAG),
    only28: f.field('only28', NUM),
    label28: f.field('label28', TEXT),
  };
}
function eco29(f: Fields) {
  return {
    ecosystem: 'Eco29' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle4: f.field('toggle4', FLAG),
    only29: f.field('only29', NUM),
    label29: f.field('label29', TEXT),
  };
}
function eco30(f: Fields) {
  return {
    ecosystem: 'Eco30' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle0: f.field('toggle0', FLAG),
    only30: f.field('only30', NUM),
    label30: f.field('label30', TEXT),
  };
}
function eco31(f: Fields) {
  return {
    ecosystem: 'Eco31' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle1: f.field('toggle1', FLAG),
    only31: f.field('only31', NUM),
    label31: f.field('label31', TEXT),
  };
}
function eco32(f: Fields) {
  return {
    ecosystem: 'Eco32' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle2: f.field('toggle2', FLAG),
    only32: f.field('only32', NUM),
    label32: f.field('label32', TEXT),
  };
}
function eco33(f: Fields) {
  return {
    ecosystem: 'Eco33' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle3: f.field('toggle3', FLAG),
    only33: f.field('only33', NUM),
    label33: f.field('label33', TEXT),
  };
}
function eco34(f: Fields) {
  return {
    ecosystem: 'Eco34' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle4: f.field('toggle4', FLAG),
    only34: f.field('only34', NUM),
    label34: f.field('label34', TEXT),
  };
}
function eco35(f: Fields) {
  return {
    ecosystem: 'Eco35' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle0: f.field('toggle0', FLAG),
    only35: f.field('only35', NUM),
    label35: f.field('label35', TEXT),
  };
}
function eco36(f: Fields) {
  return {
    ecosystem: 'Eco36' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle1: f.field('toggle1', FLAG),
    only36: f.field('only36', NUM),
    label36: f.field('label36', TEXT),
  };
}
function eco37(f: Fields) {
  return {
    ecosystem: 'Eco37' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle2: f.field('toggle2', FLAG),
    only37: f.field('only37', NUM),
    label37: f.field('label37', TEXT),
  };
}
function eco38(f: Fields) {
  return {
    ecosystem: 'Eco38' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle3: f.field('toggle3', FLAG),
    only38: f.field('only38', NUM),
    label38: f.field('label38', TEXT),
  };
}
function eco39(f: Fields) {
  return {
    ecosystem: 'Eco39' as const,
    prompt: f.field('prompt', TEXT),
    steps: f.field('steps', NUM),
    cfg: f.field('cfg', NUM),
    seedish: f.field('seedish', NUM),
    toggle4: f.field('toggle4', FLAG),
    only39: f.field('only39', NUM),
    label39: f.field('label39', TEXT),
  };
}

const KEYS = ['Eco0', 'Eco1', 'Eco2', 'Eco3', 'Eco4', 'Eco5', 'Eco6', 'Eco7', 'Eco8', 'Eco9', 'Eco10', 'Eco11', 'Eco12', 'Eco13', 'Eco14', 'Eco15', 'Eco16', 'Eco17', 'Eco18', 'Eco19', 'Eco20', 'Eco21', 'Eco22', 'Eco23', 'Eco24', 'Eco25', 'Eco26', 'Eco27', 'Eco28', 'Eco29', 'Eco30', 'Eco31', 'Eco32', 'Eco33', 'Eco34', 'Eco35', 'Eco36', 'Eco37', 'Eco38', 'Eco39'] as const;
const ECO = codec<(typeof KEYS)[number]>({ output: z.enum(KEYS), default: 'Eco0' });

function resolveScale(f: Fields, _ext: Ext) {
  const ecosystem = f.field('ecosystem', ECO);
  switch (ecosystem) {
    case 'Eco0': return eco0(f);
    case 'Eco1': return eco1(f);
    case 'Eco2': return eco2(f);
    case 'Eco3': return eco3(f);
    case 'Eco4': return eco4(f);
    case 'Eco5': return eco5(f);
    case 'Eco6': return eco6(f);
    case 'Eco7': return eco7(f);
    case 'Eco8': return eco8(f);
    case 'Eco9': return eco9(f);
    case 'Eco10': return eco10(f);
    case 'Eco11': return eco11(f);
    case 'Eco12': return eco12(f);
    case 'Eco13': return eco13(f);
    case 'Eco14': return eco14(f);
    case 'Eco15': return eco15(f);
    case 'Eco16': return eco16(f);
    case 'Eco17': return eco17(f);
    case 'Eco18': return eco18(f);
    case 'Eco19': return eco19(f);
    case 'Eco20': return eco20(f);
    case 'Eco21': return eco21(f);
    case 'Eco22': return eco22(f);
    case 'Eco23': return eco23(f);
    case 'Eco24': return eco24(f);
    case 'Eco25': return eco25(f);
    case 'Eco26': return eco26(f);
    case 'Eco27': return eco27(f);
    case 'Eco28': return eco28(f);
    case 'Eco29': return eco29(f);
    case 'Eco30': return eco30(f);
    case 'Eco31': return eco31(f);
    case 'Eco32': return eco32(f);
    case 'Eco33': return eco33(f);
    case 'Eco34': return eco34(f);
    case 'Eco35': return eco35(f);
    case 'Eco36': return eco36(f);
    case 'Eco37': return eco37(f);
    case 'Eco38': return eco38(f);
    case 'Eco39': return eco39(f);
  }
}

export type ScaleState = ReturnType<typeof resolveScale>;
export const scaleForm = defineForm<Ext>()({ resolve: resolveScale });

// Narrowing still works at width 40, and non-members genuinely lack the field.
type Assert<T extends true> = T;
type Eco7 = Extract<ScaleState, { ecosystem: 'Eco7' }>;
type Eco31 = Extract<ScaleState, { ecosystem: 'Eco31' }>;
type _A = Assert<Eco7['only7'] extends number ? true : false>;
type _B = Assert<'only7' extends keyof Eco31 ? false : true>;
type _C = Assert<Eco31['label31'] extends string ? true : false>;
