import { z } from 'zod';
import { codec, defineForm, type Fields } from '$lib/index.js';
import { enumCodec } from '$lib/codecs/index.js';

// Demo ladder, rung 1: every core mechanism on a form anyone can read.
// Discriminants (size, half-and-half), option sets that depend on other
// fields (crust), a projection with a reasoned note (the coverage budget),
// and a stack of computed fields.

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

const STYLE = enumCodec({
  options: [
    { value: 'classic', label: 'Classic' },
    { value: 'deep-dish', label: 'Deep dish' },
    { value: 'calzone', label: 'Calzone' },
  ],
  default: 'classic',
});

const SIZE = enumCodec({
  options: (Object.keys(SIZES) as Size[]).map((value) => ({ value, label: SIZES[value].label })),
  default: 'medium',
});

const BOOL = codec({
  input: z.boolean().optional(),
  output: z.boolean(),
  default: false,
});

export type Crust = 'thin' | 'hand-tossed' | 'stuffed';
const CRUST = codec<Crust, { options: Crust[] }>({
  input: z.enum(['thin', 'hand-tossed', 'stuffed']).optional(),
  output: z.enum(['thin', 'hand-tossed', 'stuffed']),
  default: 'hand-tossed',
});

const PICK = codec<string[], { budget: number }>({
  input: z.array(z.string()).optional(),
  output: z.array(z.string()),
  default: [],
});

/** Keep toppings inside the size's coverage budget: trim from the end. */
function toppingField(f: Fields, key: string, budget: number) {
  const picked = f.field(key, PICK, { meta: { budget } });
  const kept: string[] = [];
  let used = 0;
  for (const id of picked) {
    const weight = byId.get(id)?.weight ?? 0;
    if (used + weight > budget) continue;
    kept.push(id);
    used += weight;
  }
  if (kept.length === picked.length) return picked;
  return f.correct(key, kept, 'oven_physics', {
    dropped: picked.filter((id) => !kept.includes(id)),
    budget,
  });
}

export const pizzaForm = defineForm()({
  codecs: {
    style: STYLE,
    size: SIZE,
    glutenFree: BOOL,
    halfAndHalf: BOOL,
    crust: CRUST,
    extraSauce: BOOL,
    toppings: PICK,
    toppingsLeft: PICK,
    toppingsRight: PICK,
  },
  resolve: (f: Fields) => {
    // style drives half the form: deep-dish forbids thin crust, calzone has
    // no crust choice OR half-and-half at all (it's folded), and only
    // deep-dish offers extra sauce.
    const style = f.field('style', STYLE);
    const size = f.field('size', SIZE);
    const config = SIZES[size];
    const glutenFree = f.field('glutenFree', BOOL);

    let crust: Crust | undefined;
    if (style !== 'calzone') {
      const crustOptions: Crust[] = glutenFree
        ? ['thin']
        : style === 'deep-dish'
          ? size === 'small'
            ? ['hand-tossed']
            : ['hand-tossed', 'stuffed']
          : size === 'small'
            ? ['thin', 'hand-tossed']
            : ['thin', 'hand-tossed', 'stuffed'];
      // Remembered per size: your large stuffed pick survives trying a small.
      crust = f.field('crust', CRUST, { scope: size, meta: { options: crustOptions } });
      if (!crustOptions.includes(crust)) {
        crust = f.correct(
          'crust',
          crustOptions[0]!,
          glutenFree
            ? 'gluten_free_forces_thin'
            : style === 'deep-dish'
              ? 'deep_dish_needs_structure'
              : 'not_available_for_size',
          { size, style }
        );
      }
    }

    const extraSauce =
      style === 'deep-dish' ? { extraSauce: f.field('extraSauce', BOOL) } : {};
    const halfAndHalf = style === 'calzone' ? false : f.field('halfAndHalf', BOOL);
    const base = {
      style,
      size,
      glutenFree,
      ...(crust !== undefined ? { crust } : {}),
      ...extraSauce,
    };

    const sauce = 'extraSauce' in base && base.extraSauce === true;
    const finish = (allToppings: string[], used: number, budget: number) => {
      const calories =
        config.baseCalories +
        Math.round(caloriesOf(allToppings) * (halfAndHalf ? 0.5 : 1)) +
        (sauce ? 80 : 0);
      const bakeMinutes =
        9 +
        (crust === 'stuffed' ? 3 : 0) +
        (style === 'deep-dish' ? 8 : style === 'calzone' ? 4 : 0) +
        Math.ceil(used / 2);
      const price =
        config.basePrice +
        used * 1.25 +
        (crust === 'stuffed' ? 2 : 0) +
        (style === 'deep-dish' ? 3 : 0) +
        (sauce ? 1 : 0);
      return {
        budgetUsed: f.computed('budgetUsed', used),
        budgetTotal: f.computed('budgetTotal', budget),
        calories: f.computed('calories', calories),
        bakeMinutes: f.computed('bakeMinutes', bakeMinutes),
        price: f.computed('price', Math.round(price * 100) / 100),
      };
    };

    const styleBudget = style === 'calzone' ? Math.max(2, config.budget - 1) : config.budget;

    if (halfAndHalf) {
      const sideBudget = Math.max(2, Math.floor(styleBudget / 2));
      const toppingsLeft = toppingField(f, 'toppingsLeft', sideBudget);
      const toppingsRight = toppingField(f, 'toppingsRight', sideBudget);
      const used = weightOf(toppingsLeft) + weightOf(toppingsRight);
      return {
        ...base,
        halfAndHalf,
        toppingsLeft,
        toppingsRight,
        ...finish([...toppingsLeft, ...toppingsRight], used, sideBudget * 2),
      };
    }

    const toppings = toppingField(f, 'toppings', styleBudget);
    return {
      ...base,
      halfAndHalf,
      toppings,
      ...finish(toppings, weightOf(toppings), styleBudget),
    };
  },
});
