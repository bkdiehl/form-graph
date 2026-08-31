import { defineGraph } from '$lib/index.js';
import { boolOf } from '$lib/codecs/index.js';
import { contact } from './contact.js';
import { withAddress } from './address.js';
import { payment, FEE_RATE } from './payment.js';

// The PARENT: sections are ordinary graphs mounted into ONE chain with .use,
// so cross-section facts are ctx reads — billing mirrors shipping via a field
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
      (ctx) => !(ctx as { billingSameAsShipping: boolean }).billingSameAsShipping
    )
  )
  .use(payment)
  .computed('shipping', (ctx) => ({
    street: ctx.shippingStreet,
    city: ctx.shippingCity,
    country: ctx.shippingCountry,
  }))
  .computed('billing', (ctx) =>
    ctx.billingSameAsShipping
      ? ctx.shipping
      : { street: ctx.billingStreet!, city: ctx.billingCity!, country: ctx.billingCountry! }
  )
  .computed('shippingCost', (ctx) => SHIPPING_COST[ctx.shippingCountry])
  .computed('paymentFee', (ctx) => Math.round(ITEM_TOTAL * FEE_RATE[ctx.paymentMethod] * 100) / 100)
  .computed('total', (ctx) => ITEM_TOTAL + ctx.shippingCost + ctx.paymentFee);

