import { defineRules, type Fields } from '../core/index.js';
import {
  LTX_DISTILLED_IDS,
  LTXV23_DEV_ID,
  getAllVersionIds,
  ltxBaseModelToEcosystem,
  ltxMaxDurationByResolution,
  ltxVersionOptions,
  ltxv23AspectRatiosByResolution,
  ltxv2AspectRatios,
  ltxv2Durations,
  ltxv25AspectRatiosByResolution,
} from './constants.js';
import {
  MODEL,
  SEED,
  SNIPPETS,
  VIDEO,
  BOOL,
  v1AspectRatioCodec,
  v1EnumCodec,
  v1ImagesCodec,
  v1ResourcesCodec,
  v1SliderCodec,
  v1TextCodec,
  type ResourceData,
} from './codecs.js';
import type { VideoExt, VideoHubCtx } from './video-hub.js';

/**
 * Full-fidelity port of v1's ltx-graph.ts (+ the checkpoint graph it merges).
 * Every table is the real one; every `when:` becomes control flow; the two
 * checkpoint transforms become `correct`; the baseModel→ecosystem effect
 * becomes a rule.
 */

const LTX_VALID_VERSION_IDS = getAllVersionIds(ltxVersionOptions);

type LTXVersion = 'v2' | 'v23' | 'v25';

// Hoisted codec variants (per config — the churn rule).
const FIRST_LAST_IMAGES = v1ImagesCodec({
  slots: [{ label: 'First Frame', required: true }, { label: 'Last Frame (optional)' }],
  warnOnMissingAiMetadata: true,
  aspectRatios: ['16:9', '3:2', '1:1', '2:3', '9:16'],
});
const REFERENCE_IMAGE = v1ImagesCodec({ warnOnMissingAiMetadata: true });

const CFG = v1SliderCodec({
  min: 1,
  max: 10,
  step: 0.5,
  default: 3,
  presets: [
    { label: 'Low', value: 2 },
    { label: 'Balanced', value: 3 },
    { label: 'High', value: 5 },
  ],
});
const STEPS = v1SliderCodec({
  min: 10,
  max: 50,
  default: 30,
  presets: [
    { label: 'Fast', value: 20 },
    { label: 'Balanced', value: 30 },
    { label: 'Quality', value: 50 },
  ],
});
const FRAME_GUIDE = v1SliderCodec({
  min: 0,
  max: 1,
  step: 0.05,
  default: 1,
  presets: [
    { label: 'Subtle', value: 0.3 },
    { label: 'Moderate', value: 0.6 },
    { label: 'Strong', value: 1 },
  ],
});

const AR_V2 = v1AspectRatioCodec({ options: ltxv2AspectRatios, default: '16:9' });
const AR_V23: Record<string, ReturnType<typeof v1AspectRatioCodec>> = {
  '720p': v1AspectRatioCodec({ options: ltxv23AspectRatiosByResolution['720p']!, default: '16:9' }),
  '1080p': v1AspectRatioCodec({ options: ltxv23AspectRatiosByResolution['1080p']!, default: '16:9' }),
};
const AR_V25: Record<string, ReturnType<typeof v1AspectRatioCodec>> = {
  '720p': v1AspectRatioCodec({ options: ltxv25AspectRatiosByResolution['720p']!, default: '16:9' }),
  '1080p': v1AspectRatioCodec({ options: ltxv25AspectRatiosByResolution['1080p']!, default: '16:9' }),
};

const DURATION_V2 = v1EnumCodec({ options: ltxv2Durations, default: 5 });
const DURATION_BY_RES: Record<string, ReturnType<typeof v1SliderCodec>> = {
  '720p': v1SliderCodec({ min: 3, max: ltxMaxDurationByResolution['720p']!, step: 1, default: 5 }),
  '1080p': v1SliderCodec({ min: 3, max: ltxMaxDurationByResolution['1080p']!, step: 1, default: 5 }),
};

const RESOLUTION = v1EnumCodec({
  options: [
    { label: '720p', value: '720p' },
    { label: '1080p', value: '1080p' },
  ] as const,
  default: '720p',
});

const CANNY_LOW = v1SliderCodec({
  min: 0,
  max: 1,
  step: 0.01,
  default: 0.1,
  presets: [
    { label: 'Low', value: 0.05 },
    { label: 'Medium', value: 0.1 },
    { label: 'High', value: 0.2 },
  ],
});
const CANNY_HIGH = v1SliderCodec({
  min: 0,
  max: 1,
  step: 0.01,
  default: 0.3,
  presets: [
    { label: 'Low', value: 0.15 },
    { label: 'Medium', value: 0.3 },
    { label: 'High', value: 0.5 },
  ],
});
const GUIDE_STRENGTH = v1SliderCodec({
  min: 0,
  max: 1,
  step: 0.05,
  default: 0.7,
  presets: [
    { label: 'Subtle', value: 0.3 },
    { label: 'Moderate', value: 0.7 },
    { label: 'Strong', value: 1 },
  ],
});
const NUM_FRAMES = v1SliderCodec({ min: 1, max: 120, default: 24 });
const GENERATE_AUDIO = BOOL(true);
const PROMPT = v1TextCodec('prompt');
const NEGATIVE_PROMPT = v1TextCodec('negativePrompt');

const isImg2vidVariant = (workflow: string) =>
  workflow === 'img2vid' || workflow.startsWith('img2vid:');

export function ltxResolver(f: Fields, ext: VideoExt, ctx: VideoHubCtx) {
  const { workflow, ecosystem } = ctx;

  // images — first/last slots for img2vid variants, single for ref2vid.
  const wantsFirstLast = isImg2vidVariant(workflow) && workflow !== 'img2vid:ref2vid';
  const images = wantsFirstLast
    ? f.field('images', FIRST_LAST_IMAGES)
    : workflow === 'img2vid:ref2vid'
      ? f.field('images', REFERENCE_IMAGE)
      : undefined;

  // model — combined LTX version selector, defaultModelId LTXV23 Dev, locked.
  let model = f.field('model', MODEL, {
    default: (): ResourceData => ({ id: LTXV23_DEV_ID, model: { type: 'Checkpoint' } }),
    meta: (value) => ({
      modelLocked: true,
      versions: ltxVersionOptions,
      defaultModelId: LTXV23_DEV_ID,
      excludeIds: value ? [value.id] : [],
    }),
  });

  // ecosystem-mismatch transform: a checkpoint whose baseModel belongs to a
  // NON-LTX ecosystem resets to the default (v1's transform step 1); locked
  // substitution snaps unknown version ids to the default.
  const DEFAULT_MODEL: ResourceData = { id: LTXV23_DEV_ID, model: { type: 'Checkpoint' } };
  if (model?.baseModel && !(model.baseModel in ltxBaseModelToEcosystem)) {
    model = f.correct('model', DEFAULT_MODEL, 'ecosystem_mismatch', { ecosystem });
  } else if (model?.id && model.id !== LTXV23_DEV_ID && !LTX_VALID_VERSION_IDS.has(model.id)) {
    model = f.correct('model', DEFAULT_MODEL, 'locked_default', { ecosystem, workflow });
  }

  const seed = f.field('seed', SEED);
  const distilled = LTX_DISTILLED_IDS.has(model?.id ?? -1);
  const perf = distilled
    ? {}
    : { cfgScale: f.field('cfgScale', CFG), steps: f.field('steps', STEPS) };

  const frameGuide =
    wantsFirstLast && images?.length === 2
      ? { frameGuideStrength: f.field('frameGuideStrength', FRAME_GUIDE) }
      : {};

  const resources = f.field('resources', v1ResourcesCodec(ext.limits.maxResources));

  const ltxVersion: LTXVersion =
    ecosystem === 'LTXV25' ? 'v25' : ecosystem === 'LTXV23' ? 'v23' : 'v2';
  f.computed('ltxVersion', ltxVersion);

  const versionFields = (() => {
    switch (ltxVersion) {
      case 'v2':
        return {
          ltxVersion,
          ...(workflow !== 'img2vid' ? { aspectRatio: f.field('aspectRatio', AR_V2) } : {}),
          duration: f.field('duration', DURATION_V2),
        };
      case 'v23': {
        const narrowed = { ltxVersion };
        const video =
          workflow === 'vid2vid:edit' || workflow === 'vid2vid:extend'
            ? { video: f.field('video', VIDEO) }
            : {};
        const resolution = f.field('resolution', RESOLUTION);
        return {
          ...narrowed,
          ...video,
          resolution,
          ...(workflow === 'txt2vid' || workflow === 'img2vid:ref2vid'
            ? { aspectRatio: f.field('aspectRatio', AR_V23[resolution] ?? AR_V23['720p']!) }
            : {}),
          duration: f.field('duration', DURATION_BY_RES[resolution] ?? DURATION_BY_RES['720p']!),
          ...(workflow === 'vid2vid:edit'
            ? {
                cannyLowThreshold: f.field('cannyLowThreshold', CANNY_LOW),
                cannyHighThreshold: f.field('cannyHighThreshold', CANNY_HIGH),
                guideStrength: f.field('guideStrength', GUIDE_STRENGTH),
              }
            : {}),
          ...(workflow === 'vid2vid:extend' ? { numFrames: f.field('numFrames', NUM_FRAMES) } : {}),
          generateAudio: f.field('generateAudio', GENERATE_AUDIO),
        };
      }
      case 'v25': {
        const resolution = f.field('resolution', RESOLUTION);
        return {
          ltxVersion,
          resolution,
          ...(workflow === 'txt2vid' || workflow === 'img2vid:ref2vid'
            ? { aspectRatio: f.field('aspectRatio', AR_V25[resolution] ?? AR_V25['720p']!) }
            : {}),
          duration: f.field('duration', DURATION_BY_RES[resolution] ?? DURATION_BY_RES['720p']!),
          generateAudio: f.field('generateAudio', GENERATE_AUDIO),
        };
      }
    }
  })();

  // v1's `enablePromptEnhancer` node is `when: false` — never active, so it
  // simply doesn't exist here.

  const triggerWords = f.computed(
    'triggerWords',
    (model ? [model, ...resources] : resources).flatMap((r) => r.trainedWords ?? [])
  );

  const snippets = ext.flags?.wildcards ? { snippets: f.field('snippets', SNIPPETS) } : {};

  const promptRequired = !images?.length;
  const prompt = f.field('prompt', PROMPT, {
    refine: (s) =>
      s.refine((value) => !promptRequired || value.trim().length > 0, {
        message: 'Prompt is required',
        params: { kind: 'required' },
      }),
    refineDeps: [promptRequired],
  });
  const negativePrompt = f.field('negativePrompt', NEGATIVE_PROMPT);

  return {
    ecosystem: ecosystem as 'LTXV2' | 'LTXV23' | 'LTXV25',
    ...(images !== undefined ? { images } : {}),
    model,
    seed,
    ...perf,
    ...frameGuide,
    resources,
    ...versionFields,
    triggerWords,
    ...snippets,
    prompt,
    negativePrompt,
  };
}

type LtxRuleState = { ecosystem?: string; model?: ResourceData };

/** v1's checkpoint-graph effect: picking a version switches the ecosystem. */
const createLtxCoupling = defineRules<void, LtxRuleState>({
  scope: (state) => (state.ecosystem ?? '').startsWith('LTXV'),
  rules: () => ({
    model: (model: ResourceData | undefined, { state }) => {
      const target = model?.baseModel ? ltxBaseModelToEcosystem[model.baseModel] : undefined;
      if (target && target !== state.ecosystem) return { ecosystem: target };
    },
  }),
});
export const ltxCoupling = createLtxCoupling();
