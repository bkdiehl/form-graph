import { z } from 'zod';
import { codec, defineSection } from '$lib/index.js';
import { enumCodec } from '$lib/codecs/index.js';

// Payment section: its own branching (each method mounts different fields).
// Whether 'invoice' is allowed depends on the CONTACT section, which this
// module can't see — so the parent passes that fact in as an argument, the
// same shape as a field kit's per-pass args.

const METHOD = enumCodec({
  options: [
    { value: 'card', label: 'Card' },
    { value: 'paypal', label: 'PayPal' },
    { value: 'invoice', label: 'Invoice' },
  ],
  default: 'card',
});

const CARD_NUMBER = codec({
  input: z.string().optional(),
  output: z
    .string()
    .transform((s) => s.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{15,16}$/, '15 or 16 digits')),
  default: '',
});

const EXPIRY = codec({
  input: z.string().optional(),
  output: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'MM/YY'),
  default: '',
});

const PO_NUMBER = codec({
  input: z.string().optional(),
  output: z.string().min(1, 'PO number is required for invoicing'),
  default: '',
});

export const FEE_RATE = { card: 0.02, paypal: 0.03, invoice: 0 } as const;

export const paymentSection = defineSection({
  codecs: {
    paymentMethod: METHOD,
    cardNumber: CARD_NUMBER,
    cardExpiry: EXPIRY,
    poNumber: PO_NUMBER,
  },

  resolve: (f, args: { allowInvoice: boolean }) => {
    // One constraint declaration: disables the option AND corrects a value
    // sitting on it — before branching, so method and mounted fields agree.
    const paymentMethod = f.field('paymentMethod', {
      constrain: { invoice: !args.allowInvoice && 'invoice_requires_business' },
    });
    return {
      paymentMethod,
      ...(paymentMethod === 'card'
        ? { cardNumber: f.field('cardNumber'), cardExpiry: f.field('cardExpiry') }
        : {}),
      ...(paymentMethod === 'invoice' ? { poNumber: f.field('poNumber') } : {}),
    };
  },
});
