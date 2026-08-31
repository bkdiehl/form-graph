import { branchOn } from '$lib/index.js';
import { enumOf } from '$lib/codecs/index.js';
import { s3Graph, s3Meta } from './s3.js';
import { emailGraph, emailMeta } from './email.js';
import { webhookGraph, webhookMeta } from './webhook.js';

// The HUB: separately-defined destination graphs tied together by one
// discriminator FIELD. `branchOn` declares that field itself, merges the
// member registries and effects, and resolves to a destination-discriminated
// union — `Extract<PublishState, { destination: 's3' }>` is exactly the s3 shape.

const DESTINATIONS = [s3Meta, emailMeta, webhookMeta];

const DESTINATION = enumOf({
  options: DESTINATIONS.map((d) => ({ value: d.key, label: d.label })),
  default: 's3',
});

export const publishForm = branchOn('destination', DESTINATION, {
  s3: s3Graph,
  email: emailGraph,
  webhook: webhookGraph,
});

export type PublishState = ReturnType<typeof publishForm.resolve>;
