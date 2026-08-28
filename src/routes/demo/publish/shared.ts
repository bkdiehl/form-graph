import { numberCodec } from '$lib/codecs/index.js';
import type { Fields } from '$lib/index.js';

// A field SHARED by several branches: same key, same codec — but scoped by
// the destination, so each branch remembers its own value. This is the hub
// pattern's second half: the discriminator switches subforms, and scope keeps
// their overlapping fields from fighting over one memory slot.

export const RETRIES = numberCodec({ min: 0, max: 10, default: 3 });

export function retriesField(f: Fields, destination: string) {
  return f.field('retries', RETRIES, { scope: destination });
}
