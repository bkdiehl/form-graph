import { branch, defineGraph } from '$lib/index.js';
import { enumOf } from '$lib/defs/index.js';
import { s3Graph, s3Meta } from './s3.js';
import { emailGraph, emailMeta } from './email.js';
import { webhookGraph, webhookMeta } from './webhook.js';

// The HUB: separately-defined destination graphs tied together by one
// discriminator FIELD, declared like any other field and dispatched by a
// keyed branch. The member keys type the arms, so
// `Extract<PublishState, { destination: 's3' }>` is exactly the s3 shape.

const DESTINATIONS = [s3Meta, emailMeta, webhookMeta];

const DESTINATION = enumOf({
  options: DESTINATIONS.map((d) => ({ value: d.key, label: d.label })),
  default: 's3',
});

export const publishForm = defineGraph()
  .field('destination', DESTINATION)
  .use(
    branch('destination', [
      [['s3'], s3Graph],
      [['email'], emailGraph],
      [['webhook'], webhookGraph],
    ] as const)
  );

export type PublishState = ReturnType<typeof publishForm.resolve>;
