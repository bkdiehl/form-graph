import { z } from 'zod';
import { codec, defineForm, type Fields } from '$lib/index.js';
import { contactSection } from './contact.js';
import { addressSection } from './address.js';
import { paymentSection, FEE_RATE } from './payment.js';

// The PARENT: sections stay separate modules, and joining them is plain
// composition — spread their codec records, call their resolver fragments,
// list their rule units. There is no subform machinery, because a resolver
// is just a function and functions compose. What the parent OWNS is the
// logic no section can know alone: billing-mirrors-shipping, and payment
// methods gated by who the customer is.

const shipping = addressSection({
  street: 'shippingStreet',
  city: 'shippingCity',
  country: 'shippingCountry',
});

const billing = addressSection({
  street: 'billingStreet',
  city: 'billingCity',
  country: 'billingCountry',
});

const BOOL_TRUE = codec({
  input: z.boolean().optional(),
  output: z.boolean(),
  default: true,
});

const ITEM_TOTAL = 120;
const SHIPPING_COST = { US: 5, DE: 12, JP: 18 } as const;

export const checkoutForm = defineForm({
  codecs: {
    ...contactSection.codecs,
    ...shipping.codecs,
    ...billing.codecs,
    ...paymentSection.codecs,
    billingSameAsShipping: BOOL_TRUE,
  },

  reconcile: [contactSection.rules],

  resolve: (f: Fields) => {
    const contact = contactSection.resolve(f);
    const shippingAddress = shipping.resolve(f);

    const billingSameAsShipping = f.field('billingSameAsShipping', BOOL_TRUE);
    // Unchecking mounts a second instance of the SAME section under its own
    // keys — with its own memory, since intent is per key.
    const billingAddress = billingSameAsShipping ? shippingAddress : billing.resolve(f);

    // Cross-section: invoicing is a business feature. Only the parent can
    // see both sections, so it passes the fact DOWN as an argument.
    const payment = paymentSection.resolve(f, { allowInvoice: contact.isBusiness });

    const shippingCost = SHIPPING_COST[shippingAddress.country];
    const fee = Math.round(ITEM_TOTAL * FEE_RATE[payment.paymentMethod] * 100) / 100;

    return {
      ...contact,
      billingSameAsShipping,
      shipping: shippingAddress,
      billing: billingAddress,
      ...payment,
      shippingCost: f.computed('shippingCost', shippingCost),
      paymentFee: f.computed('paymentFee', fee),
      total: f.computed('total', ITEM_TOTAL + shippingCost + fee),
    };
  },
});
