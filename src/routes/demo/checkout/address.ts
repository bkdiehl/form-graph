import { z } from 'zod';
import { type AnyFieldDef, type FieldDef, type Graph } from '$lib/index.js';
import { enumOf, textOf } from '$lib/defs/index.js';

// The same section mounted more than once: field keys must be unique
// form-wide, so the caller names a PREFIX. Without `when` the fields are
// unconditional (required keys); with `when` the whole mount is conditional
// (optional keys) — the billing block behind the same-as-shipping toggle.

const TEXT = (message: string): FieldDef<string> =>
  textOf({ output: z.string().min(1, message) });

const COUNTRY = enumOf({
  options: [
    { value: 'US', label: 'United States' },
    { value: 'DE', label: 'Germany' },
    { value: 'JP', label: 'Japan' },
  ],
  default: 'US',
});

type Country = 'US' | 'DE' | 'JP';

export function withAddress<C extends object, D extends Record<string, AnyFieldDef>, P extends string>(
  g: Graph<C, void, D>,
  prefix: P
): Graph<
  C & Record<`${P}Street` | `${P}City`, string> & Record<`${P}Country`, Country>,
  void,
  D & Record<`${P}Street` | `${P}City`, FieldDef<string>> & Record<`${P}Country`, typeof COUNTRY>
>;
export function withAddress<C extends object, D extends Record<string, AnyFieldDef>, P extends string>(
  g: Graph<C, void, D>,
  prefix: P,
  when: (c: C) => boolean
): Graph<
  C & Partial<Record<`${P}Street` | `${P}City`, string> & Record<`${P}Country`, Country>>,
  void,
  D & Record<`${P}Street` | `${P}City`, FieldDef<string>> & Record<`${P}Country`, typeof COUNTRY>
>;
export function withAddress(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g: Graph<any, void, any>,
  prefix: string,
  when?: (c: object) => boolean
) {
  if (when === undefined) {
    return g
      .field(`${prefix}Street`, TEXT('Street is required'))
      .field(`${prefix}City`, TEXT('City is required'))
      .field(`${prefix}Country`, COUNTRY);
  }
  return g
    .field(`${prefix}Street`, (c) => (when(c) ? TEXT('Street is required') : null))
    .field(`${prefix}City`, (c) => (when(c) ? TEXT('City is required') : null))
    .field(`${prefix}Country`, (c) => (when(c) ? COUNTRY : null));
}
