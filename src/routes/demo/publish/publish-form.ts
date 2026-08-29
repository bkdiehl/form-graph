import { defineForm, type Fields } from '$lib/index.js';
import { enumOf } from '$lib/codecs/index.js';
import { s3Graph, s3Meta } from './s3.js';
import { emailGraph, emailMeta } from './email.js';
import { webhookGraph, webhookMeta } from './webhook.js';

// The HUB: separately-defined destination graphs tied together by one
// discriminator. The switch is the only resolver logic in the whole form —
// and it's the one thing a graph can't express: producing a
// destination-DISCRIMINATED union of shapes.

const DESTINATIONS = [s3Meta, emailMeta, webhookMeta];

const DESTINATION = enumOf({
  options: DESTINATIONS.map((d) => ({ value: d.key, label: d.label })),
  default: 's3',
});

export const publishForm = defineForm({
  codecs: {
    destination: DESTINATION,
    ...s3Graph.codecs,
    ...emailGraph.codecs,
    ...webhookGraph.codecs,
  },
  resolve: (f: Fields) => {
    const destination = f.field('destination', DESTINATION);
    switch (destination) {
      case 's3':
        return { destination, ...s3Graph.resolve(f, undefined as void) };
      case 'email':
        return { destination, ...emailGraph.resolve(f, undefined as void) };
      case 'webhook':
        return { destination, ...webhookGraph.resolve(f, undefined as void) };
    }
  },
});

export type PublishState = ReturnType<typeof publishForm.resolve>['state'];
