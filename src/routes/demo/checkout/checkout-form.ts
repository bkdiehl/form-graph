import { defineForm, defineGraph, type Fields } from '$lib/index.js';
import { boolOf } from '$lib/codecs/index.js';
import { withContact, contactRules } from './contact.js';
import { withAddress } from './address.js';
import { withPayment, FEE_RATE } from './payment.js';

// The PARENT: sections are Graph -> Graph functions composed into ONE chain,
// so cross-section facts are just ctx reads — billing mirrors shipping via a
// field between two mounts of the SAME section, and invoicing reads the
// contact section's answer three sections up.

const ITEM_TOTAL = 120;
const SHIPPING_COST = { US: 5, DE: 12, JP: 18 } as const;

const base = withAddress(withContact(defineGraph()), 'shipping');

const graph = withPayment(
  withAddress(
    base.field('billingSameAsShipping', boolOf(true)),
    'billing',
    (ctx) => !(ctx as { billingSameAsShipping: boolean }).billingSameAsShipping
  )
)
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
  .computed('total', (ctx) => ITEM_TOTAL + ctx.shippingCost + ctx.paymentFee)
  .effect(contactRules);

export const checkoutForm = defineForm({
  codecs: graph.codecs,
  reconcile: [...graph.effects],
  resolve: (f: Fields) => graph.resolve(f, undefined as void),
});
