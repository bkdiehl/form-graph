import { z } from 'zod';
import { defineRules, section } from '$lib/index.js';
import { boolOf } from '$lib/codecs/index.js';

// A SECTION appends its fields to whatever chain it's given and hands the
// chain back, ctx flowing through. It knows nothing about the form it joins;
// `section()` owns the generics that keep the caller's ctx and registry.

export const withContact = section()((g) =>
  g
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
);

// Section-owned coupling: switching OFF business clears the business-only
// intent, so stale company data can't linger and resurface.
export const contactRules = defineRules<void, { isBusiness?: boolean }>({
  rules: () => ({
    isBusiness: (value) =>
      value === false ? { company: undefined, vatId: undefined } : undefined,
  }),
});
