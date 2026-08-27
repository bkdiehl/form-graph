import { defineRules, type Fields } from '../core/index.js';
import {
  ecosystemDefaultModelId,
  getAspectRatioOptions,
  wan21AspectRatioList,
  wan22AspectRatioList,
  wan25AspectRatioList,
  wan27AspectRatioList,
  wan25Durations,
  wanAspectRatios,
  wanDurations,
  wanEcosystemToVersion,
  wanVersionDefs,
  type WanVersion,
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
  type ImageEntry,
  type ResourceData,
} from './codecs.js';
import type { VideoExt, VideoHubCtx } from './video-hub.js';

/**
 * Full-fidelity port of v1's wan-graph.ts: five version subgraphs, the
 * flag-driven 2.2 modes, and the workflow/resolution → ecosystem sync effects
 * restated as rules.
 */

// Hoisted aspect-ratio codecs per (version, resolution) — the churn rule.
const arCodec = (resolution: string, list: Parameters<typeof getAspectRatioOptions>[1], dflt: string) =>
  v1AspectRatioCodec({ options: getAspectRatioOptions(resolution, list), default: dflt });

const AR_21: Record<string, ReturnType<typeof v1AspectRatioCodec>> = {
  '480p': arCodec('480p', wan21AspectRatioList, '1:1'),
  '720p': arCodec('720p', wan21AspectRatioList, '1:1'),
};
const AR_22_MULTISTEP: Record<string, ReturnType<typeof v1AspectRatioCodec>> = {
  '480p': arCodec('480p', wan22AspectRatioList, '1:1'),
  '720p': arCodec('720p', wan22AspectRatioList, '1:1'),
};
const AR_25: Record<string, ReturnType<typeof v1AspectRatioCodec>> = {
  '480p': arCodec('480p', wan25AspectRatioList, '1:1'),
  '720p': arCodec('720p', wan25AspectRatioList, '1:1'),
  '1080p': arCodec('1080p', wan25AspectRatioList, '1:1'),
};
const AR_27: Record<string, ReturnType<typeof v1AspectRatioCodec>> = {
  '720p': arCodec('720p', wan27AspectRatioList, '16:9'),
  '1080p': arCodec('1080p', wan27AspectRatioList, '16:9'),
};
const AR_5B = v1AspectRatioCodec({ options: wanAspectRatios, default: '1:1' });

const RES_21 = v1EnumCodec({
  options: [
    { label: '480p', value: '480p' },
    { label: '720p', value: '720p' },
  ] as const,
  default: '480p',
});
const RES_22 = RES_21;
const RES_5B = v1EnumCodec({
  options: [
    { label: '580p', value: '580p' },
    { label: '720p', value: '720p' },
  ] as const,
  default: '580p',
});
const RES_25 = v1EnumCodec({
  options: [
    { label: '480p', value: '480p' },
    { label: '720p', value: '720p' },
    { label: '1080p', value: '1080p' },
  ] as const,
  default: '480p',
});
const RES_27 = v1EnumCodec({
  options: [
    { label: '720p', value: '720p' },
    { label: '1080p', value: '1080p' },
  ] as const,
  default: '720p',
});

const CFG = v1SliderCodec({
  min: 1,
  max: 10,
  step: 0.5,
  default: 3.5,
  presets: [
    { label: 'Low', value: 2 },
    { label: 'Balanced', value: 3.5 },
    { label: 'High', value: 6 },
  ],
});
const SHIFT = v1SliderCodec({ min: 1, max: 20, default: 8 });
const STEPS_5B = v1SliderCodec({ min: 20, max: 60, default: 40 });
const DURATION_22 = v1EnumCodec({ options: wanDurations, default: 5 });
const DURATION_25 = v1EnumCodec({ options: wan25Durations, default: 5 });
const DURATION_27_LONG = v1SliderCodec({ min: 2, max: 15, step: 1, default: 5 });
const DURATION_27_SHORT = v1SliderCodec({ min: 2, max: 10, step: 1, default: 5 });
const INTERPOLATOR = v1EnumCodec({
  // literal options so the value type is the v1 union, not string — the
  // tables-pin test keeps this in step with wanInterpolatorModels.
  options: [
    { label: 'None', value: 'none' },
    { label: 'FILM', value: 'film' },
    { label: 'RIFE', value: 'rife' },
  ] as const,
  default: 'none',
});
const DRAFT = BOOL(false);
const GENERATE_ENHANCER = BOOL(false);
const PROMPT = v1TextCodec('prompt');
const NEGATIVE_PROMPT = v1TextCodec('negativePrompt');

const FIRST_LAST_IMAGES = v1ImagesCodec({
  slots: [{ label: 'First Frame', required: true }, { label: 'Last Frame (optional)' }],
  warnOnMissingAiMetadata: true,
});
const REF_IMAGES = v1ImagesCodec({ warnOnMissingAiMetadata: true, max: 5 });
const SINGLE_IMAGE = v1ImagesCodec({ warnOnMissingAiMetadata: true });

export function wanResolver(f: Fields, ext: VideoExt, ctx: VideoHubCtx) {
  const { workflow, ecosystem } = ctx;
  const wanVersion: WanVersion = wanEcosystemToVersion.get(ecosystem) ?? 'v2.1';

  // images — v2.7 gets slots/ref variants; others a single image for img2vid.
  const isRef2vid = workflow === 'img2vid:ref2vid';
  const isImg2vid = workflow === 'img2vid' || workflow === 'img2vid:first-last';
  const isEditVideo = workflow.startsWith('vid2vid');
  const images =
    wanVersion === 'v2.7' && isImg2vid
      ? f.field('images', FIRST_LAST_IMAGES)
      : wanVersion === 'v2.7' && isRef2vid
        ? f.field('images', REF_IMAGES)
        : !workflow.startsWith('txt') && !isEditVideo
          ? f.field('images', SINGLE_IMAGE)
          : undefined;
  const hasImages = Array.isArray(images) && images.length > 0;

  // model — no version selector; ecosystem default, locked.
  const defaultId = ecosystemDefaultModelId[ecosystem];
  let model = f.field('model', MODEL, {
    default: (): ResourceData | undefined =>
      defaultId ? { id: defaultId, model: { type: 'Checkpoint' } } : undefined,
    meta: (value) => ({
      modelLocked: true,
      versions: undefined,
      defaultModelId: defaultId,
      excludeIds: value ? [value.id] : [],
    }),
  });

  // locked substitution: any non-default checkpoint snaps to the ecosystem default.
  if (model?.id && defaultId && model.id !== defaultId) {
    model = f.correct('model', { id: defaultId, model: { type: 'Checkpoint' } }, 'locked_default', {
      ecosystem,
      workflow,
    });
  }

  f.computed('wanVersion', wanVersion);
  const seed = f.field('seed', SEED);
  const cfgScale = f.field('cfgScale', CFG);

  const text = (opts: { negative?: boolean; resources?: ResourceData[] }) => {
    const triggerWords = f.computed(
      'triggerWords',
      (model ? [model, ...(opts.resources ?? [])] : opts.resources ?? []).flatMap(
        (r) => r.trainedWords ?? []
      )
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
    return {
      triggerWords,
      ...snippets,
      prompt,
      ...(opts.negative ? { negativePrompt: f.field('negativePrompt', NEGATIVE_PROMPT) } : {}),
    };
  };

  const base = { ecosystem, model, seed, cfgScale };

  switch (wanVersion) {
    case 'v2.1': {
      const resolution = f.field('resolution', RES_21);
      const resources = f.field('resources', v1ResourcesCodec(ext.limits.maxResources));
      return {
        ...base,
        wanVersion,
        ...(images !== undefined ? { images } : {}),
        resolution,
        ...(hasImages ? {} : { aspectRatio: f.field('aspectRatio', AR_21[resolution] ?? AR_21['480p']!) }),
        duration: f.field('duration', DURATION_22),
        resources,
        ...text({ resources }),
      };
    }
    case 'v2.2': {
      const multiStep = ext.flags?.wan22MultiStep === true;
      const resolution = f.field('resolution', RES_22);
      const arTable = multiStep ? AR_22_MULTISTEP : AR_25;
      return {
        ...base,
        wanVersion,
        ...(images !== undefined ? { images } : {}),
        ...text({ negative: true }),
        resolution,
        ...(hasImages ? {} : { aspectRatio: f.field('aspectRatio', arTable[resolution] ?? arTable['480p']!) }),
        shift: f.field('shift', SHIFT),
        ...(multiStep ? { duration: f.field('duration', DURATION_22) } : {}),
        ...(multiStep
          ? {}
          : {
              interpolatorModel: f.field('interpolatorModel', INTERPOLATOR),
              draft: f.field('draft', DRAFT),
            }),
        resources: f.field('resources', v1ResourcesCodec(2)),
      };
    }
    case 'v2.2-5b': {
      const resolution = f.field('resolution', RES_5B);
      return {
        ...base,
        wanVersion,
        ...(images !== undefined ? { images } : {}),
        ...(hasImages ? {} : { aspectRatio: f.field('aspectRatio', AR_5B) }),
        ...text({ negative: true }),
        resolution,
        steps: f.field('steps', STEPS_5B),
        shift: f.field('shift', SHIFT),
        interpolatorModel: f.field('interpolatorModel', INTERPOLATOR),
        resources: f.field('resources', v1ResourcesCodec(2)),
      };
    }
    case 'v2.5': {
      const resolution = f.field('resolution', RES_25);
      return {
        ...base,
        wanVersion,
        ...(images !== undefined ? { images } : {}),
        ...text({ negative: true }),
        resolution,
        ...(hasImages ? {} : { aspectRatio: f.field('aspectRatio', AR_25[resolution] ?? AR_25['480p']!) }),
        duration: f.field('duration', DURATION_25),
      };
    }
    case 'v2.7': {
      const video =
        workflow === 'vid2vid:edit' ? { video: f.field('video', VIDEO) } : {};
      const hasVideo = 'video' in video && !!video.video?.url;
      const resolution = f.field('resolution', RES_27);
      const durationCodec = isRef2vid || workflow === 'vid2vid:edit' ? DURATION_27_SHORT : DURATION_27_LONG;
      return {
        ...base,
        wanVersion,
        ...(images !== undefined ? { images } : {}),
        ...video,
        ...text({}),
        ...(workflow !== 'vid2vid:edit'
          ? { negativePrompt: f.field('negativePrompt', NEGATIVE_PROMPT) }
          : {}),
        resolution,
        ...(hasImages || hasVideo
          ? {}
          : { aspectRatio: f.field('aspectRatio', AR_27[resolution] ?? AR_27['720p']!) }),
        duration: f.field('duration', durationCodec),
        ...(workflow === 'txt2vid' || workflow === 'img2vid'
          ? { enablePromptEnhancer: f.field('enablePromptEnhancer', GENERATE_ENHANCER) }
          : {}),
      };
    }
  }
}

type WanRuleState = {
  ecosystem?: string;
  workflow?: string;
  resolution?: string;
  images?: ImageEntry[];
};

/**
 * v1's two ecosystem-sync effects as rules: workflow drives T2V↔I2V for every
 * version (I2V for v2.1 is resolution-dependent, so resolution drives it too).
 */
const createWanCoupling = defineRules<void, WanRuleState>({
  scope: (state) => wanEcosystemToVersion.has(state.ecosystem ?? ''),
  rules: () => ({
    workflow: (workflow: string, { state }) => {
      const version = wanEcosystemToVersion.get(state.ecosystem ?? '');
      const def = wanVersionDefs.find((d) => d.version === version);
      if (!def) return;
      const isImg2vid = workflow === 'img2vid';
      if (def.version === 'v2.1') {
        if (!isImg2vid && state.ecosystem !== def.ecosystems.t2v) {
          return { ecosystem: def.ecosystems.t2v };
        }
        if (isImg2vid) {
          const target =
            state.resolution === '480p' ? def.ecosystems.i2v_480p : def.ecosystems.i2v;
          if (state.ecosystem !== target) return { ecosystem: target };
        }
        return;
      }
      const target = isImg2vid ? def.ecosystems.i2v : def.ecosystems.t2v;
      if (state.ecosystem !== target) return { ecosystem: target };
    },
    resolution: (resolution: string, { state }) => {
      const version = wanEcosystemToVersion.get(state.ecosystem ?? '');
      if (version !== 'v2.1' || state.workflow !== 'img2vid') return;
      const def = wanVersionDefs[0];
      const target = resolution === '480p' ? def.ecosystems.i2v_480p : def.ecosystems.i2v;
      if (state.ecosystem !== target) return { ecosystem: target };
    },
  }),
});
export const wanCoupling = createWanCoupling();
