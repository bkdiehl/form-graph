import { z } from 'zod';
import { codec, defineRules, defineSection } from '$lib/index.js';

// A SECTION: codecs + a resolver fragment + the rules that belong to it, in
// one module, knowing nothing about the form it will be mounted in. The
// parent spreads `codecs`, calls `resolve(f)`, and lists `rules` in its
// reconcile array.

const EMAIL = codec({
  input: z.string().optional(),
  output: z.string().email('A valid email is required'),
  default: '',
});

const COMPANY = codec({
  input: z.string().optional(),
  output: z.string().min(1, 'Company name is required'),
  default: '',
});

const VAT_ID = codec({
  input: z.string().optional(),
  output: z.string().regex(/^[A-Z]{2}[0-9A-Z]{6,12}$/, 'VAT id looks like DE812526315'),
  default: '',
});

const BOOL = codec({
  input: z.boolean().optional(),
  output: z.boolean(),
  default: false,
});

export const contactSection = defineSection({
  codecs: { email: EMAIL, isBusiness: BOOL, company: COMPANY, vatId: VAT_ID },

  resolve: (f) => {
    const isBusiness = f.field('isBusiness');
    return {
      email: f.field('email'),
      isBusiness,
      ...(isBusiness ? { company: f.field('company'), vatId: f.field('vatId') } : {}),
    };
  },

  // Section-owned coupling: switching OFF business clears the business-only
  // intent, so stale company data can't linger and resurface.
  rules: defineRules<void, { isBusiness?: boolean }>({
    rules: () => ({
      isBusiness: (value) =>
        value === false ? { company: undefined, vatId: undefined } : undefined,
    }),
  })(),
});
