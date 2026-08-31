import { z } from 'zod';
import { defineGraph } from '$lib/index.js';
import { boolOf, enumOf, slider, textOf } from '$lib/defs/index.js';

// Demo ladder, rung 1: every core mechanism on a form anyone can read. Each
// field is ONE function of (ctx, ext) returning its whole definition — or
// null when it doesn't exist this pass. Conditional options, gates, budgets:
// just computed.

export const SIZES = {
  small: { label: 'Small 10"', budget: 4, baseCalories: 600, basePrice: 9 },
  medium: { label: 'Medium 12"', budget: 6, baseCalories: 900, basePrice: 12 },
  large: { label: 'Large 14"', budget: 8, baseCalories: 1200, basePrice: 15 },
} as const;
export type Size = keyof typeof SIZES;

export const TOPPINGS = [
  { id: 'cheese', label: 'Extra cheese', weight: 1, calories: 90 },
  { id: 'pepperoni', label: 'Pepperoni', weight: 1, calories: 110 },
  { id: 'mushrooms', label: 'Mushrooms', weight: 1, calories: 25 },
  { id: 'onions', label: 'Red onion', weight: 1, calories: 25 },
  { id: 'pineapple', label: 'Pineapple', weight: 1, calories: 40 },
  { id: 'ham', label: 'Ham', weight: 1, calories: 70 },
  { id: 'meatballs', label: 'Meatballs', weight: 2, calories: 160 },
  { id: 'chicken', label: 'Grilled chicken', weight: 2, calories: 120 },
] as const;

const byId = new Map(TOPPINGS.map((t) => [t.id as string, t]));
const weightOf = (ids: string[]) => ids.reduce((sum, id) => sum + (byId.get(id)?.weight ?? 0), 0);
const caloriesOf = (ids: string[]) =>
  ids.reduce((sum, id) => sum + (byId.get(id)?.calories ?? 0), 0);

export type Crust = 'thin' | 'hand-tossed' | 'stuffed';

/** A topping picker capped by a coverage budget: trims from the end, noted. */
const toppingsDef = (budget: number) => ({
  input: z.array(z.string()).optional(),
  output: z.array(z.string()),
  default: [] as string[],
  meta: { budget },
  correct: (picked: string[]) => {
    const kept: string[] = [];
    let used = 0;
    for (const id of picked) {
      const weight = byId.get(id)?.weight ?? 0;
      if (used + weight > budget) continue;
      kept.push(id);
      used += weight;
    }
    return kept.length === picked.length
      ? undefined
      : {
          value: kept,
          reason: 'oven_physics',
          detail: { dropped: picked.filter((id) => !kept.includes(id)), budget },
        };
  },
});

export const pizzaForm = defineGraph()
  .field('style', enumOf({
    options: [
      { value: 'classic', label: 'Classic' },
      { value: 'deep-dish', label: 'Deep dish' },
      { value: 'calzone', label: 'Calzone' },
    ],
    default: 'classic',
  }))
  .field('size', enumOf({
    options: (Object.keys(SIZES) as Size[]).map((value) => ({ value, label: SIZES[value].label })),
    default: 'medium',
  }))
  .field('glutenFree', boolOf())
  .field('crust', (ctx) => {
    if (ctx.style === 'calzone') return null;
    // The whole crust node, computed: options, memory scope, and the
    // availability rule — gate disables AND corrects with the reason.
    return {
      ...enumOf<Crust>({
        options: [
          { value: 'thin', label: 'Thin' },
          { value: 'hand-tossed', label: 'Hand-tossed' },
          { value: 'stuffed', label: 'Stuffed' },
        ],
        default: 'hand-tossed',
        gate: {
          thin: !ctx.glutenFree && ctx.style === 'deep-dish' && 'deep_dish_needs_structure',
          'hand-tossed': ctx.glutenFree && 'gluten_free_forces_thin',
          stuffed:
            (ctx.glutenFree && 'gluten_free_forces_thin') ||
            (ctx.size === 'small' && 'not_available_for_size'),
        },
      }),
      // Remembered per size: your large stuffed pick survives trying a small.
      scope: ctx.size,
    };
  })
  .field('extraSauce', (ctx) => (ctx.style === 'deep-dish' ? boolOf() : null))
  .field('halfAndHalf', (ctx) => (ctx.style !== 'calzone' ? boolOf() : null))
  .field('toppings', (ctx) => {
    if (ctx.halfAndHalf) return null;
    const budget = ctx.style === 'calzone' ? Math.max(2, SIZES[ctx.size].budget - 1) : SIZES[ctx.size].budget;
    return toppingsDef(budget);
  })
  .field('toppingsLeft', (ctx) =>
    ctx.halfAndHalf ? toppingsDef(Math.max(2, Math.floor(SIZES[ctx.size].budget / 2))) : null
  )
  .field('toppingsRight', (ctx) =>
    ctx.halfAndHalf ? toppingsDef(Math.max(2, Math.floor(SIZES[ctx.size].budget / 2))) : null
  )
  .computed('budgetUsed', (ctx) =>
    weightOf([...(ctx.toppings ?? []), ...(ctx.toppingsLeft ?? []), ...(ctx.toppingsRight ?? [])])
  )
  .computed('budgetTotal', (ctx) => {
    const base = ctx.style === 'calzone' ? Math.max(2, SIZES[ctx.size].budget - 1) : SIZES[ctx.size].budget;
    return ctx.halfAndHalf ? Math.max(2, Math.floor(SIZES[ctx.size].budget / 2)) * 2 : base;
  })
  .computed('calories', (ctx) => {
    const all = [...(ctx.toppings ?? []), ...(ctx.toppingsLeft ?? []), ...(ctx.toppingsRight ?? [])];
    return (
      SIZES[ctx.size].baseCalories +
      Math.round(caloriesOf(all) * (ctx.halfAndHalf ? 0.5 : 1)) +
      (ctx.extraSauce === true ? 80 : 0)
    );
  })
  .computed('bakeMinutes', (ctx) =>
    9 +
    (ctx.crust === 'stuffed' ? 3 : 0) +
    (ctx.style === 'deep-dish' ? 8 : ctx.style === 'calzone' ? 4 : 0) +
    Math.ceil((ctx.budgetUsed ?? 0) / 2)
  )
  .computed('price', (ctx) =>
    Math.round(
      (SIZES[ctx.size].basePrice +
        (ctx.budgetUsed ?? 0) * 1.25 +
        (ctx.crust === 'stuffed' ? 2 : 0) +
        (ctx.style === 'deep-dish' ? 3 : 0) +
        (ctx.extraSauce === true ? 1 : 0)) *
        100
    ) / 100
  );

