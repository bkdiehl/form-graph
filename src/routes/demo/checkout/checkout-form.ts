import { defineGraph } from '$lib/index.js';
import { boolOf } from '$lib/defs/index.js';
import { contact } from './contact.js';
import { withAddress } from './address.js';
import { payment, FEE_RATE } from './payment.js';

// The PARENT: sections are ordinary graphs mounted into ONE chain with .use,
// so cross-section facts are c reads — billing mirrors shipping via a field
// between two mounts of the SAME section, and the payment graph's need for
// `isBusiness` is satisfied by what contact declared three mounts up. The
// contact graph's own rules ride in through the mount; nothing is re-imported.

const ITEM_TOTAL = 120;
const SHIPPING_COST = { US: 5, DE: 12, JP: 18 } as const;

export const checkoutForm = defineGraph()
  .use(contact)
  .use((g) => withAddress(g, 'shipping'))
  .field('billingSameAsShipping', boolOf({ default: true }))
  .use((g) =>
    withAddress(
      g,
      'billing',
      (c) => !(c as { billingSameAsShipping: boolean }).billingSameAsShipping
    )
  )
  .use(payment)
  .computed('shipping', (c) => ({
    street: c.shippingStreet,
    city: c.shippingCity,
    country: c.shippingCountry,
  }))
  .computed('billing', (c) =>
    c.billingSameAsShipping
      ? c.shipping
      : { street: c.billingStreet!, city: c.billingCity!, country: c.billingCountry! }
  )
  .computed('shippingCost', (c) => SHIPPING_COST[c.shippingCountry])
  .computed('paymentFee', (c) => Math.round(ITEM_TOTAL * FEE_RATE[c.paymentMethod] * 100) / 100)
  .computed('total', (c) => ITEM_TOTAL + c.shippingCost + c.paymentFee);

