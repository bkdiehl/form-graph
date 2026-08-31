import { z } from 'zod';
import { defineGraph } from '$lib/index.js';
import { boolOf } from '$lib/defs/index.js';

// A reusable section is just a GRAPH: define it standalone, mount it into a
// parent chain with `.use(contact)`. Its fields, registry, and effects join
// the parent; it knows nothing about the form it lands in.

export const contact = defineGraph()
  .field('email', {
    input: z.string().optional(),
    output: z.string().email('A valid email is required'),
    default: '',
  })
  .field('isBusiness', boolOf())
  .field('company', (ctx) =>
    ctx.isBusiness
      ? {
          input: z.string().optional(),
          output: z.string().min(1, 'Company name is required'),
          default: '',
        }
      : null
  )
  .field('vatId', (ctx) =>
    ctx.isBusiness
      ? {
          input: z.string().optional(),
          output: z.string().regex(/^[A-Z]{2}[0-9A-Z]{6,12}$/, 'VAT id looks like DE812526315'),
          default: '',
        }
      : null
  )
  // Section-owned coupling, a plain map keyed by the trigger field: switching
  // OFF business clears the business-only intent, so stale company data can't
  // linger and resurface. It rides the mount — the parent never imports it.
  .effect({
    isBusiness: (value) =>
      value === false ? { company: undefined, vatId: undefined } : undefined,
  });
