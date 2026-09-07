import { z } from 'zod';
import { branch, defineGraph, enumOf, list, slider, textOf } from '$lib/core/index.js';

/**
 * The invoice builder — the `list()` demo (0.4).
 *
 * One graph, three layers of the collection story:
 *
 * - `items` is a LIST: min 1, max 6, each element resolved through its own
 *   member graph — with its own `kind` branch, its own computeds, its own
 *   errors. Element fields live at dotted paths (`items[a1b2].sku`), which
 *   is what makes per-row subscriptions, per-row errors and per-row
 *   persistence fall out of the ordinary machinery.
 * - The member BRANCHES per element: a service line has hours × rate, a
 *   goods line has quantity × unit price. Two rows can sit on different
 *   arms at once.
 * - The root computed `total` reads the assembled elements like any other
 *   upstream value — lists compose into the graph, not beside it.
 */

const service = defineGraph()
  .field('hours', slider({ min: 1, max: 40, step: 1, default: 8 }))
  .field('rate', {
    input: z.coerce.number().optional(),
    output: z.number().min(1).max(500),
    default: 120,
  })
  .computed('lineTotal', ({ hours, rate }) => hours * rate);

const goods = defineGraph()
  .field('sku', {
    input: z.string().optional(),
    // judged at submit — a pristine row doesn't scold
    output: z.string().min(1, 'SKU is required'),
    default: '',
  })
  .field('quantity', slider({ min: 1, max: 100, step: 1, default: 1 }))
  .field('unitPrice', {
    input: z.coerce.number().optional(),
    output: z.number().min(0.01).max(9999),
    default: 25,
  })
  .computed('lineTotal', ({ quantity, unitPrice }) => quantity * unitPrice);

const item = defineGraph()
  .field('description', {
    input: z.string().optional(),
    output: z.string().min(1, 'Description is required'),
    default: '',
  })
  .field(
    'kind',
    enumOf({
      options: [
        { value: 'service', label: 'Service' },
        { value: 'goods', label: 'Goods' },
      ],
      default: 'service',
    })
  )
  .use(
    branch('kind', [
      [['service'], service],
      [['goods'], goods],
    ] as const)
  );

export const invoiceForm = defineGraph()
  .field('client', {
    input: z.string().optional(),
    output: z.string().min(1, 'Client is required'),
    default: '',
  })
  .field(
    'currency',
    enumOf({
      options: [
        { value: 'USD', label: '$ USD' },
        { value: 'EUR', label: '€ EUR' },
      ],
      default: 'USD',
    })
  )
  .field('notes', textOf({ default: '' }))
  .use(list('items', item, { min: 1, max: 6 }))
  // the assembled elements are ordinary upstream state — aggregate freely
  .computed('total', ({ items }) => items.reduce((sum, line) => sum + line.lineTotal, 0));
