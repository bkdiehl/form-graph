import { z } from 'zod';
import { section } from '$lib/index.js';
import { enumOf } from '$lib/codecs/index.js';

// Payment section: its own branching (each method mounts different fields).
// Whether 'invoice' is allowed depends on the CONTACT section — which is just
// a ctx read, because sections share one chain.

export const withPayment = section<{ isBusiness: boolean }>()((g) =>
  g
    .field('paymentMethod', (ctx) =>
      enumOf({
        options: [
          { value: 'card', label: 'Card' },
          { value: 'paypal', label: 'PayPal' },
          { value: 'invoice', label: 'Invoice' },
        ],
        default: 'card',
        // One declaration: disabled option AND correction, before branching,
        // so method and mounted fields can never disagree.
        gate: { invoice: !ctx.isBusiness && 'invoice_requires_business' },
      })
    )
    .field('cardNumber', (ctx) =>
      ctx.paymentMethod === 'card'
        ? {
            input: z.string().optional(),
            output: z
              .string()
              .transform((s) => s.replace(/\s/g, ''))
              .pipe(z.string().regex(/^\d{15,16}$/, '15 or 16 digits')),
            default: '',
          }
        : null
    )
    .field('cardExpiry', (ctx) =>
      ctx.paymentMethod === 'card'
        ? {
            input: z.string().optional(),
            output: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'MM/YY'),
            default: '',
          }
        : null
    )
    .field('poNumber', (ctx) =>
      ctx.paymentMethod === 'invoice'
        ? {
            input: z.string().optional(),
            output: z.string().min(1, 'PO number is required for invoicing'),
            default: '',
          }
        : null
    )
);

export const FEE_RATE = { card: 0.02, paypal: 0.03, invoice: 0 } as const;
