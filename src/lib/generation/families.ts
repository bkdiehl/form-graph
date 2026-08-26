import type { Fields } from '../core/index.js';
import type { GenerationExt } from './config.js';
import { fluxResolver } from './flux.js';
import {
  ltxResolver,
  nanoBananaResolver,
  stableDiffusionResolver,
  wanResolver,
} from './ecosystems.js';
import { groupOf } from './shared.js';

/**
 * OUTPUT-FAMILY layer between the hub and the ecosystem resolvers, split on
 * the seam the domain already has (a workflow's output type).
 *
 * Why (measured in `src/__stress__/scale-60-*.ts`): NOT compile survival — at
 * 60 realistic branches the flat union costs ~0.13s of check time and the
 * split saves only ~20% of instantiations; v1's TS2589 was instantiation
 * DEPTH, which switch-return inference doesn't accumulate, so width grows
 * linearly. The split earns its place for locality instead:
 *
 * - handlers/components import the FAMILY state and Extract<> over ~a dozen
 *   members regardless of total ecosystem count, and hovers print the family
 *   alias instead of the full union
 * - new-family growth (audio, 3d) is a new file + one hub case, not edits to a
 *   monolithic switch
 * - post-extraction, families are the natural code-splitting seam (video
 *   resolvers stay out of image-page bundles)
 *
 * Escalation path if a type wall EVER appears (none is in sight): stop
 * composing family states into one global union — consumers already import
 * family states, so only the store's own State parameter would need widening;
 * beyond that, one form per family is the final escape hatch.
 */

export function imageFamilyResolver(
  f: Fields,
  ext: GenerationExt,
  ctx: { workflow: string; ecosystem: string }
) {
  switch (groupOf(ctx.ecosystem)) {
    case 'flux':
      return fluxResolver(f, ext, ctx);
    case 'sd':
      return stableDiffusionResolver(f, ext, ctx);
    default:
      return nanoBananaResolver(f, ext, ctx);
  }
}

export function videoFamilyResolver(
  f: Fields,
  ext: GenerationExt,
  ctx: { workflow: string; ecosystem: string }
) {
  switch (groupOf(ctx.ecosystem)) {
    case 'wan':
      return wanResolver(f, ext, ctx);
    default:
      return ltxResolver(f, ext, ctx);
  }
}

/** Family state unions — what handlers and components should import. */
export type ImageFamilyState = ReturnType<typeof imageFamilyResolver>;
export type VideoFamilyState = ReturnType<typeof videoFamilyResolver>;
