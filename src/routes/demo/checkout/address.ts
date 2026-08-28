import { z } from 'zod';
import { codec, type Fields } from '$lib/index.js';
import { enumCodec } from '$lib/codecs/index.js';

// A section FACTORY: the same fields instantiated more than once in one form.
// Field keys must be unique form-wide, so the caller names them — the factory
// returns a codecs record under those keys and a fragment that resolves them
// back into one plain address shape.

const TEXT = (message: string) =>
  codec({
    input: z.string().optional(),
    output: z.string().min(1, message),
    default: '',
  });

const STREET = TEXT('Street is required');
const CITY = TEXT('City is required');

const COUNTRY = enumCodec({
  options: [
    { value: 'US', label: 'United States' },
    { value: 'DE', label: 'Germany' },
    { value: 'JP', label: 'Japan' },
  ],
  default: 'US',
});

export interface AddressKeys {
  street: string;
  city: string;
  country: string;
}

export type Address = ReturnType<ReturnType<typeof addressSection>['resolve']>;

export function addressSection<const K extends AddressKeys>(keys: K) {
  const codecs = {
    [keys.street]: STREET,
    [keys.city]: CITY,
    [keys.country]: COUNTRY,
  } as Record<K['street'], typeof STREET> &
    Record<K['city'], typeof CITY> &
    Record<K['country'], typeof COUNTRY>;

  return {
    codecs,
    resolve: (f: Fields) => ({
      street: f.field(keys.street, STREET),
      city: f.field(keys.city, CITY),
      country: f.field(keys.country, COUNTRY),
    }),
  };
}
