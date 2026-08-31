import { z } from 'zod';
import { type RuleMap } from '../core/index.js';
import { codec } from '../core/codec.js';
import { type Fields } from '../core/resolve.js';
import {
  aspectRatioCodec,
  createSamplerKit,
  createSchedulerKit,
  createVaeKit,
  createImagesKit,
  numberCodec,
  type AspectRatioOption,
  type ResourceValue,
} from './codecs/index.js';
import { baseModelToEcosystem, type GenerationExt } from './config.js';
import { checkpointKit, collectTriggerWords, groupOf, resourcesKit, SEED, textSection } from './shared.js';

/** SD, LTX, Wan, and NanoBanana resolvers — the rest of the covering set. */

// --- Stable Diffusion (stable-diffusion-graph.ts) ---------------------------

const sdAspectRatios: AspectRatioOption[] = [
  { label: 'Square', value: '1:1', width: 512, height: 512 },
  { label: 'Landscape', value: '16:9', width: 912, height: 512 },
  { label: 'Portrait', value: '9:16', width: 512, height: 912 },
];

const SD_AR = aspectRatioCodec({ options: sdAspectRatios, default: '1:1' });
const SD_CFG = numberCodec({ min: 1, max: 30, default: 7, step: 0.5 });
const SD_STEPS = numberCodec({ min: 10, max: 50, default: 25 });
const CLIP_SKIP = numberCodec({ min: 1, max: 3, default: 2 });

const sdCheckpoint = checkpointKit({
  appliesTo: (state) => state.ecosystem === 'SD1' || state.ecosystem === 'SDXL',
});
const sampler = createSamplerKit({
  options: ['Euler a', 'Euler', 'DPM++ 2M Karras', 'Heun', 'DDIM'],
});
const scheduler = createSchedulerKit({ options: ['simple', 'karras', 'exponential'] });
const vae = createVaeKit({
  isCompatible: (ecosystem, v: ResourceValue) =>
    !v.baseModel || baseModelToEcosystem.get(v.baseModel) === ecosystem,
});

export function stableDiffusionResolver(
  f: Fields,
  ext: GenerationExt,
  ctx: { workflow: string; ecosystem: string }
) {
  const scope = groupOf(ctx.ecosystem);
  const model = sdCheckpoint.field(f, { ctx, scope });
  const resources = resourcesKit.field(f, {
    ecosystem: ctx.ecosystem,
    limit: ext.limits.maxResources,
    scope,
  });
  return {
    ecosystem: ctx.ecosystem as 'SD1' | 'SDXL',
    model,
    ...textSection(f, {
      promptRequired: true,
      negativePrompt: true,
      triggerWords: collectTriggerWords(model, resources),
    }),
    resources,
    vae: vae.field(f, { ecosystem: ctx.ecosystem }),
    sampler: sampler.field(f, undefined),
    scheduler: scheduler.field(f, undefined),
    aspectRatio: f.field('aspectRatio', SD_AR, { scope }),
    cfgScale: f.field('cfgScale', SD_CFG, { scope }),
    steps: f.field('steps', SD_STEPS, { scope }),
    clipSkip: f.field('clipSkip', CLIP_SKIP, { scope }),
    seed: f.field('seed', SEED),
  };
}



// --- LTX (ltx-graph.ts) -----------------------------------------------------

const LTX_RESOLUTIONS = ['480p', '720p', '1080p'] as const;
type LtxResolution = (typeof LTX_RESOLUTIONS)[number];

/** v23 aspect ratios vary by RESOLUTION — the mechanism ltx exercises. */
const ltxAspectRatiosByResolution: Record<LtxResolution, AspectRatioOption[]> = {
  '480p': [
    { label: '16:9', value: '16:9', width: 854, height: 480 },
    { label: '1:1', value: '1:1', width: 480, height: 480 },
  ],
  '720p': [
    { label: '16:9', value: '16:9', width: 1280, height: 720 },
    { label: '9:16', value: '9:16', width: 720, height: 1280 },
    { label: '1:1', value: '1:1', width: 720, height: 720 },
  ],
  '1080p': [
    { label: '16:9', value: '16:9', width: 1920, height: 1080 },
    { label: '1:1', value: '1:1', width: 1080, height: 1080 },
  ],
};

const maxDurationByResolution: Record<LtxResolution, number> = {
  '480p': 10,
  '720p': 10,
  '1080p': 6,
};

const LTX_RESOLUTION = codec<LtxResolution, { options: readonly string[] }>({
  input: z
    .enum(LTX_RESOLUTIONS)
    .optional()
    .catch(() => undefined),
  output: z.enum(LTX_RESOLUTIONS),
  default: '720p',
  meta: { options: LTX_RESOLUTIONS },
});

// Codecs must not be rebuilt per pass, so the resolution selects among three
// hoisted codecs.
const LTX_AR: Record<LtxResolution, ReturnType<typeof aspectRatioCodec>> = {
  '480p': aspectRatioCodec({ options: ltxAspectRatiosByResolution['480p'], default: '16:9' }),
  '720p': aspectRatioCodec({ options: ltxAspectRatiosByResolution['720p'], default: '16:9' }),
  '1080p': aspectRatioCodec({ options: ltxAspectRatiosByResolution['1080p'], default: '16:9' }),
};

const DURATION = numberCodec({ min: 2, max: 10, default: 5 });

const ltxCheckpoint = checkpointKit({
  appliesTo: (state) => state.ecosystem === 'LTXV2' || state.ecosystem === 'LTXV23',
});
// `modes` map to workflow keys — the picker switching workflow through images
// meta (gap 4). Selecting "Reference" moves img2vid -> img2vid:ref2vid.
const imageModes = [
  { label: 'First/Last Frame', value: 'img2vid', workflow: 'img2vid' },
  { label: 'Reference Images', value: 'ref2vid', workflow: 'img2vid:ref2vid' },
];
const firstLastFrame = createImagesKit({
  slots: [{ label: 'First Frame', required: true }, { label: 'Last Frame' }],
  modes: imageModes,
});
const referenceImages = createImagesKit({ max: 3, min: 1, label: 'Reference images', modes: imageModes });

export function ltxResolver(
  f: Fields,
  _ext: GenerationExt,
  ctx: { workflow: string; ecosystem: string }
) {
  const scope = groupOf(ctx.ecosystem);
  const model = ltxCheckpoint.field(f, { ctx, scope });

  const base = {
    ecosystem: ctx.ecosystem as 'LTXV2' | 'LTXV23',
    model,
    ...textSection(f, { promptRequired: true, negativePrompt: true }),
    seed: f.field('seed', SEED),
  };

  // v2 output is fixed 720p.
  if (ctx.ecosystem === 'LTXV2') {
    return {
      ...base,
      aspectRatio: f.field('aspectRatio', LTX_AR['720p'], { scope }),
      ...(ctx.workflow === 'img2vid'
        ? { images: firstLastFrame.field(f, { scope: ctx.workflow }) }
        : {}),
    };
  }

  const resolution = f.field('resolution', LTX_RESOLUTION, { scope });
  const maxDuration = maxDurationByResolution[resolution];
  return {
    ...base,
    resolution,
    aspectRatio: f.field('aspectRatio', LTX_AR[resolution], { scope: [scope, resolution] }),
    duration: (() => {
      let duration = f.field('duration', DURATION, {
        scope: [scope, resolution],
        meta: { min: 2, max: maxDuration, step: 1 },
      });
      if (duration > maxDuration) {
        duration = f.correct('duration', maxDuration, 'exceeds_resolution_max', { maxDuration });
      }
      return duration;
    })(),
    ...(ctx.workflow === 'img2vid'
      ? { images: firstLastFrame.field(f, { scope: ctx.workflow }) }
      : ctx.workflow === 'img2vid:ref2vid'
      ? { images: referenceImages.field(f, { scope: ctx.workflow }) }
      : {}),
  };
}



// --- Wan 2.1 (wan-graph.ts) — intra-leaf ecosystem switching ----------------
//
// 480p and 720p are SEPARATE ECOSYSTEMS behind one resolution picker. The
// resolution -> ecosystem direction is selection coupling (a rule); the
// ecosystem -> resolution direction is derivation (projection forces the
// field to match), so the pair cannot fight — same split the hub uses.

const WAN_RESOLUTIONS = ['480p', '720p'] as const;
type WanResolution = (typeof WAN_RESOLUTIONS)[number];

const wanEcoByResolution: Record<WanResolution, string> = {
  '480p': 'WanV21_480p',
  '720p': 'WanV21_720p',
};
const wanResolutionByEco: Record<string, WanResolution> = {
  WanV21_480p: '480p',
  WanV21_720p: '720p',
};

const WAN_RESOLUTION = codec<WanResolution, { options: readonly string[] }>({
  input: z.enum(WAN_RESOLUTIONS).optional().catch(() => undefined),
  output: z.enum(WAN_RESOLUTIONS),
  default: '480p',
  meta: { options: WAN_RESOLUTIONS },
});

const wanCheckpoint = checkpointKit({
  appliesTo: (state) => (state.ecosystem ?? '').startsWith('WanV21'),
});
const WAN_DURATION = numberCodec({ min: 2, max: 6, default: 5 });

export function wanResolver(
  f: Fields,
  _ext: GenerationExt,
  ctx: { workflow: string; ecosystem: string }
) {
  const model = wanCheckpoint.field(f, { ctx, scope: 'wan' });
  const impliedResolution = wanResolutionByEco[ctx.ecosystem] ?? '480p';

  return {
    ecosystem: ctx.ecosystem as 'WanV21_480p' | 'WanV21_720p',
    model,
    resolution: (() => {
      // The ecosystem is authoritative; the picker's value always reflects it.
      const resolution = f.field('resolution', WAN_RESOLUTION);
      return resolution === impliedResolution
        ? resolution
        : f.correct('resolution', impliedResolution, 'ecosystem_implies_resolution');
    })(),
    ...textSection(f, { promptRequired: true, negativePrompt: true }),
    duration: f.field('duration', WAN_DURATION, { scope: 'wan' }),
    seed: f.field('seed', SEED),
    ...(ctx.workflow === 'img2vid'
      ? { images: createImagesKitSingleton.field(f, { scope: ctx.workflow }) }
      : {}),
  };
}

const createImagesKitSingleton = createImagesKit({ max: 1, min: 1, label: 'Source image' });

/** Picking a resolution IS picking an ecosystem. */
export const wanCoupling: RuleMap<{ ecosystem?: string }> = {
  resolution: (resolution: WanResolution, { patch, state }) => {
    if (!(state.ecosystem ?? '').startsWith('WanV21')) return;
    if ('ecosystem' in patch) return;
    const target = wanEcoByResolution[resolution];
    if (target && target !== state.ecosystem) return { ecosystem: target };
  },
};
export { wanCheckpoint, sdCheckpoint, ltxCheckpoint, nbCheckpoint };

// --- NanoBanana (nano-banana-graph.ts) --------------------------------------

const NB_AR = aspectRatioCodec({
  options: [
    { label: '1:1', value: '1:1', width: 1024, height: 1024 },
    { label: '16:9', value: '16:9', width: 1344, height: 768 },
  ],
  default: '1:1',
});
const NB_RESOLUTION = codec<'1K' | '2K' | '4K', { options: readonly string[] }>({
  input: z.enum(['1K', '2K', '4K']).optional().catch(() => undefined),
  output: z.enum(['1K', '2K', '4K']),
  default: '1K',
  meta: { options: ['1K', '2K', '4K'] },
});

const nbCheckpoint = checkpointKit({ appliesTo: (state) => state.ecosystem === 'NanoBanana' });
const editImages = createImagesKit({ max: 4, min: 1, label: 'Reference images' });

export function nanoBananaResolver(
  f: Fields,
  _ext: GenerationExt,
  ctx: { workflow: string; ecosystem: string }
) {
  return {
    ecosystem: 'NanoBanana' as const,
    model: nbCheckpoint.field(f, { ctx, scope: 'nano-banana' }),
    ...textSection(f, { promptRequired: ctx.workflow !== 'img2img:edit' }),
    aspectRatio: f.field('aspectRatio', NB_AR),
    resolution: f.field('resolution', NB_RESOLUTION),
    seed: f.field('seed', SEED),
    ...(ctx.workflow === 'img2img:edit' ? { images: editImages.field(f, { scope: ctx.workflow }) } : {}),
  };
}


