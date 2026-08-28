import { defineForm, type Fields, type InferState } from '$lib/index.js';
import { enumCodec } from '$lib/codecs/index.js';
import { RETRIES } from './shared.js';
import { s3Destination } from './s3.js';
import { emailDestination } from './email.js';
import { webhookDestination } from './webhook.js';

// The HUB: separately-defined destination forms tied together by one
// discriminator. The discriminator's option list is BUILT from the modules,
// so adding a destination is one import plus one array entry — and the
// switch below is what makes the state a discriminated union: each case
// returns that destination's shape, tagged with the discriminator.

const DESTINATIONS = [s3Destination, emailDestination, webhookDestination];

const DESTINATION = enumCodec({
  options: DESTINATIONS.map((d) => ({ value: d.key, label: d.label })),
  default: 's3',
});

export const publishForm = defineForm({
  codecs: {
    destination: DESTINATION,
    ...s3Destination.codecs,
    ...emailDestination.codecs,
    ...webhookDestination.codecs,
    retries: RETRIES,
  },

  resolve: (f: Fields) => {
    const destination = f.field('destination', DESTINATION);

    switch (destination) {
      case 's3':
        return { destination, ...s3Destination.resolve(f) };
      case 'email':
        return { destination, ...emailDestination.resolve(f) };
      case 'webhook':
        return { destination, ...webhookDestination.resolve(f) };
    }
  },
});

export type PublishState = InferState<typeof publishForm>;
