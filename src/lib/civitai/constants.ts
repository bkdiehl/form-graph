/**
 * Real civitai generation config for the LTX + Wan video families — every
 * value here is DERIVED from the vendored v1 tree (scripts/extract-v1-tables.mjs
 * or copied verbatim from the graph files) and pinned against it by
 * __tests__/tables-pin.test.ts, so it cannot silently drift.
 */

export type AspectRatioOption = { label: string; value: string; width: number; height: number };

// --- shared aspect-ratio dimension tables (generation.constants.ts, verbatim) --

export type GenerationResolution = '480p' | '720p' | '1080p' | '2K' | '4K';
export type GenerationAspectRatio =
  | '21:9'
  | '16:9'
  | '3:2'
  | '5:4'
  | '4:3'
  | '1:1'
  | '3:4'
  | '4:5'
  | '2:3'
  | '9:16';

export const aspectRatioDimensions: Record<
  GenerationResolution,
  Partial<Record<GenerationAspectRatio, { width: number; height: number }>>
> = {
  '480p': {
    '21:9': { width: 1344, height: 576 },
    '16:9': { width: 848, height: 480 },
    '3:2': { width: 720, height: 480 },
    '5:4': { width: 608, height: 480 },
    '4:3': { width: 640, height: 480 },
    '1:1': { width: 480, height: 480 },
    '3:4': { width: 480, height: 640 },
    '4:5': { width: 384, height: 480 },
    '2:3': { width: 480, height: 720 },
    '9:16': { width: 480, height: 848 },
  },
  '720p': {
    '21:9': { width: 2016, height: 864 },
    '16:9': { width: 1280, height: 720 },
    '3:2': { width: 1080, height: 720 },
    '5:4': { width: 912, height: 720 },
    '4:3': { width: 960, height: 720 },
    '1:1': { width: 720, height: 720 },
    '3:4': { width: 720, height: 960 },
    '4:5': { width: 576, height: 720 },
    '2:3': { width: 720, height: 1080 },
    '9:16': { width: 720, height: 1280 },
  },
  '1080p': {
    '21:9': { width: 3024, height: 1296 },
    '16:9': { width: 1920, height: 1080 },
    '3:2': { width: 1620, height: 1080 },
    '5:4': { width: 1344, height: 1080 },
    '4:3': { width: 1440, height: 1080 },
    '1:1': { width: 1080, height: 1080 },
    '3:4': { width: 1080, height: 1440 },
    '4:5': { width: 864, height: 1080 },
    '2:3': { width: 1080, height: 1620 },
    '9:16': { width: 1080, height: 1920 },
  },
  '2K': {
    '21:9': { width: 3360, height: 1440 },
    '16:9': { width: 2560, height: 1440 },
    '4:3': { width: 2304, height: 1728 },
    '1:1': { width: 2048, height: 2048 },
    '3:4': { width: 1728, height: 2304 },
    '9:16': { width: 1440, height: 2560 },
  },
  '4K': {
    '16:9': { width: 4096, height: 2304 },
    '4:3': { width: 4096, height: 3072 },
    '1:1': { width: 4096, height: 4096 },
    '3:4': { width: 3072, height: 4096 },
    '9:16': { width: 2304, height: 4096 },
  },
};

export function getAspectRatioOptions(
  resolution: string,
  ratios: GenerationAspectRatio[]
): AspectRatioOption[] {
  const dims = aspectRatioDimensions[resolution as GenerationResolution] ?? {};
  return ratios.flatMap((ratio) => {
    const d = dims[ratio];
    return d ? [{ label: ratio, value: ratio, width: d.width, height: d.height }] : [];
  });
}

export const MAX_SEED = 4294967295;
export const MAX_PROMPT_LENGTH = 6000;

export const VID_QUANTITY_ECOSYSTEMS = new Set<string>(['LTXV23', 'LTXV25']);

// --- LTX (ltx-graph.ts, verbatim) -------------------------------------------

export const LTXV2_DEV_ID = 2578325;
export const LTXV2_DISTILLED_ID = 2600562;
export const LTXV23_DEV_ID = 2749908;
export const LTXV23_DISTILLED_ID = 2749948;
export const LTXV25_DEV_ID = 3220143;
export const LTXV25_DISTILLED_ID = 3220250;
export const SULPHUR2_DEV_ID = 2921800;
export const SULPHUR2_DISTILLED_ID = 2923808;

export const LTX_DISTILLED_IDS = new Set<number>([
  LTXV2_DISTILLED_ID,
  LTXV23_DISTILLED_ID,
  LTXV25_DISTILLED_ID,
  SULPHUR2_DISTILLED_ID,
]);

export const LTXV2_BASE_MODEL = 'LTXV2';
export const LTXV23_BASE_MODEL = 'LTXV 2.3';
export const LTXV25_BASE_MODEL = 'LTXV 2.5';

export const ltxBaseModelToEcosystem: Record<string, string> = {
  [LTXV2_BASE_MODEL]: 'LTXV2',
  [LTXV23_BASE_MODEL]: 'LTXV23',
  [LTXV25_BASE_MODEL]: 'LTXV25',
};

export interface VersionOption {
  label: string;
  value: number;
  baseModel?: string;
  children?: VersionGroup;
}
export interface VersionGroup {
  label?: string;
  options: VersionOption[];
}

export const ltxVersionOptions: VersionGroup = {
  label: 'Version',
  options: [
    {
      label: '2.0',
      value: LTXV2_DEV_ID,
      baseModel: LTXV2_BASE_MODEL,
      children: {
        label: 'Variant',
        options: [
          { label: '19B Dev', value: LTXV2_DEV_ID, baseModel: LTXV2_BASE_MODEL },
          { label: '19B Distilled', value: LTXV2_DISTILLED_ID, baseModel: LTXV2_BASE_MODEL },
        ],
      },
    },
    {
      label: '2.3',
      value: LTXV23_DEV_ID,
      baseModel: LTXV23_BASE_MODEL,
      children: {
        label: 'Variant',
        options: [
          { label: 'Dev', value: LTXV23_DEV_ID, baseModel: LTXV23_BASE_MODEL },
          { label: 'Distilled', value: LTXV23_DISTILLED_ID, baseModel: LTXV23_BASE_MODEL },
        ],
      },
    },
    {
      label: '2.5',
      value: LTXV25_DEV_ID,
      baseModel: LTXV25_BASE_MODEL,
      children: {
        label: 'Variant',
        options: [
          { label: '22B Dev', value: LTXV25_DEV_ID, baseModel: LTXV25_BASE_MODEL },
          { label: '22B Distilled', value: LTXV25_DISTILLED_ID, baseModel: LTXV25_BASE_MODEL },
        ],
      },
    },
    {
      label: 'Sulphur 2',
      value: SULPHUR2_DEV_ID,
      baseModel: LTXV23_BASE_MODEL,
      children: {
        label: 'Variant',
        options: [
          { label: 'Dev', value: SULPHUR2_DEV_ID, baseModel: LTXV23_BASE_MODEL },
          { label: 'Distilled', value: SULPHUR2_DISTILLED_ID, baseModel: LTXV23_BASE_MODEL },
        ],
      },
    },
  ],
};

export const ltxv2AspectRatios: AspectRatioOption[] = [
  { label: '16:9', value: '16:9', width: 848, height: 480 },
  { label: '3:2', value: '3:2', width: 720, height: 480 },
  { label: '1:1', value: '1:1', width: 512, height: 512 },
  { label: '2:3', value: '2:3', width: 480, height: 720 },
  { label: '9:16', value: '9:16', width: 480, height: 848 },
];

export const ltxv2Durations = [
  { label: '3 seconds', value: 3 },
  { label: '5 seconds', value: 5 },
  { label: '7 seconds', value: 7 },
];

const ltxHiResRatios = (resolution: '720p' | '1080p'): AspectRatioOption[] =>
  resolution === '720p'
    ? [
        { label: '16:9', value: '16:9', width: 1280, height: 720 },
        { label: '3:2', value: '3:2', width: 1176, height: 784 },
        { label: '1:1', value: '1:1', width: 960, height: 960 },
        { label: '2:3', value: '2:3', width: 784, height: 1176 },
        { label: '9:16', value: '9:16', width: 720, height: 1280 },
      ]
    : [
        { label: '16:9', value: '16:9', width: 1920, height: 1080 },
        { label: '3:2', value: '3:2', width: 1764, height: 1176 },
        { label: '1:1', value: '1:1', width: 1440, height: 1440 },
        { label: '2:3', value: '2:3', width: 1176, height: 1764 },
        { label: '9:16', value: '9:16', width: 1080, height: 1920 },
      ];

export const ltxv23AspectRatiosByResolution: Record<string, AspectRatioOption[]> = {
  '720p': ltxHiResRatios('720p'),
  '1080p': ltxHiResRatios('1080p'),
};
export const ltxv25AspectRatiosByResolution = ltxv23AspectRatiosByResolution;

export const ltxMaxDurationByResolution: Record<string, number> = { '720p': 20, '1080p': 15 };

// --- Wan (wan-graph.ts, verbatim) --------------------------------------------

export const wanVersionDefs = [
  {
    version: 'v2.1',
    label: '2.1',
    ecosystems: {
      t2v: 'WanVideo14B_T2V',
      i2v: 'WanVideo14B_I2V_720p',
      i2v_480p: 'WanVideo14B_I2V_480p',
    },
    extraEcosystems: ['WanVideo'] as string[],
  },
  {
    version: 'v2.2',
    label: '2.2',
    ecosystems: { t2v: 'WanVideo-22-T2V-A14B', i2v: 'WanVideo-22-I2V-A14B' },
  },
  {
    version: 'v2.2-5b',
    label: '2.2 5B',
    ecosystems: { t2v: 'WanVideo-22-TI2V-5B', i2v: 'WanVideo-22-TI2V-5B' },
  },
  {
    version: 'v2.5',
    label: '2.5',
    ecosystems: { t2v: 'WanVideo-25-T2V', i2v: 'WanVideo-25-I2V' },
  },
  {
    version: 'v2.7',
    label: '2.7',
    ecosystems: { t2v: 'WanVideo27', i2v: 'WanVideo27' },
  },
] as const;

export type WanVersion = (typeof wanVersionDefs)[number]['version'];

export const wanEcosystemToVersion = new Map<string, WanVersion>(
  wanVersionDefs.flatMap((def) => {
    const entries: [string, WanVersion][] = Object.values(def.ecosystems).map((eco) => [
      eco,
      def.version,
    ]);
    if ('extraEcosystems' in def) for (const eco of def.extraEcosystems) entries.push([eco, def.version]);
    return entries;
  })
);

export const wanAspectRatios: AspectRatioOption[] = [
  { label: '16:9', value: '16:9', width: 1280, height: 720 },
  { label: '1:1', value: '1:1', width: 1024, height: 1024 },
  { label: '9:16', value: '9:16', width: 720, height: 1280 },
];

export const wan22AspectRatioList: GenerationAspectRatio[] = [
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
  '5:4',
  '4:5',
];
export const wan25AspectRatioList: GenerationAspectRatio[] = ['16:9', '1:1', '9:16'];
export const wan21AspectRatioList: GenerationAspectRatio[] = ['16:9', '3:2', '1:1', '2:3', '9:16'];
export const wan27AspectRatioList: GenerationAspectRatio[] = ['16:9', '4:3', '1:1', '3:4', '9:16'];

export const wanDurations = [
  { label: '3 seconds', value: 3 },
  { label: '5 seconds', value: 5 },
];
export const wan25Durations = [
  { label: '5 seconds', value: 5 },
  { label: '10 seconds', value: 10 },
];

export const wanInterpolatorModels = [
  { label: 'None', value: 'none' },
  { label: 'FILM', value: 'film' },
  { label: 'RIFE', value: 'rife' },
];

// --- extracted config (scripts/extract-v1-tables.mjs output) ------------------

/** Per-ecosystem checkpoint defaults (v1 getEcosystemDefaults). All locked. */
export const ecosystemDefaultModelId: Record<string, number | undefined> = {
  LTXV2: 2578325,
  LTXV23: 2749908,
  LTXV25: 3220143,
  WanVideo: undefined,
  WanVideo1_3B_T2V: undefined,
  WanVideo14B_T2V: 1707796,
  WanVideo14B_I2V_480p: 1501125,
  WanVideo14B_I2V_720p: 1501344,
  'WanVideo-22-TI2V-5B': 2114110,
  'WanVideo-22-I2V-A14B': 2114157,
  'WanVideo-22-T2V-A14B': 2114154,
  'WanVideo-25-T2V': 2254989,
  'WanVideo-25-I2V': 2254963,
  WanVideo27: 2828005,
};

/** Generation workflows per family ecosystem (utility workflows excluded). */
export const generationWorkflowsForEcosystem: Record<string, string[]> = {
  LTXV2: ['txt2vid', 'img2vid', 'img2vid:first-last'],
  LTXV23: ['txt2vid', 'img2vid', 'img2vid:first-last', 'img2vid:ref2vid'],
  LTXV25: ['txt2vid', 'img2vid', 'img2vid:first-last', 'img2vid:ref2vid'],
  WanVideo: [],
  WanVideo1_3B_T2V: [],
  WanVideo14B_T2V: ['txt2vid', 'img2vid'],
  WanVideo14B_I2V_480p: ['img2vid'],
  WanVideo14B_I2V_720p: ['img2vid'],
  'WanVideo-22-TI2V-5B': ['txt2vid', 'img2vid'],
  'WanVideo-22-I2V-A14B': ['img2vid'],
  'WanVideo-22-T2V-A14B': ['txt2vid', 'img2vid'],
  'WanVideo-25-T2V': ['txt2vid', 'img2vid'],
  'WanVideo-25-I2V': ['img2vid'],
  WanVideo27: ['txt2vid', 'img2vid', 'img2vid:first-last', 'img2vid:ref2vid', 'vid2vid:edit'],
};

/** Every workflow key v1's config knows (drives workflow-key migration). */
export const allWorkflowKeys = new Set<string>([
  'txt2img',
  'txt2img:draft',
  'txt2img:face-fix',
  'txt2img:hires-fix',
  'img2img',
  'img2img:edit',
  'img2img:face-fix',
  'img2img:hires-fix',
  'img2img:upscale',
  'img2img:remove-background',
  'img2img:preprocess',
  'img2meta',
  'txt2vid',
  'img2vid',
  'img2vid:first-last',
  'img2vid:ref2vid',
  'vid2vid:upscale',
  'vid2vid:interpolate',
  'vid2vid:edit',
  'txt2music',
  'txt2model3d',
  'img2model3d',
  'prompt:enhance',
]);

/** New-format → old-format workflow key migration map (generation-graph.ts). */
export const NEW_TO_OLD: Record<string, string> = {
  'image:create': 'txt2img',
  'image:edit': 'img2img:edit',
  'image:draft': 'txt2img:draft',
  'image:face-fix': 'txt2img:face-fix',
  'image:hires-fix': 'txt2img:hires-fix',
  'image:upscale': 'img2img:upscale',
  'image:remove-background': 'img2img:remove-background',
  'video:create': 'txt2vid',
  'video:animate': 'txt2vid',
  'video:first-last-frame': 'img2vid',
  'video:ref2vid': 'img2vid:ref2vid',
  'video:upscale': 'vid2vid:upscale',
  'video:interpolate': 'vid2vid:interpolate',
  'video:edit': 'vid2vid:edit',
  'video:extend': 'vid2vid:extend',
  'audio:create': 'txt2music',
  'model3d:create': 'txt2model3d',
  'model3d:image-to-3d': 'img2model3d',
};

export function migrateWorkflowKey(key: string | undefined): string | undefined {
  if (!key) return key;
  if (key === 'img2vid:first-last-frame') return 'img2vid';
  const resolved = NEW_TO_OLD[key] ?? key;
  if (!allWorkflowKeys.has(resolved)) return 'txt2img';
  return resolved;
}

/** LoRA compatibility per family ecosystem (v1 getCompatibleBaseModels + filterCompatibleResources). */
export const loraCompatibleBaseModels: Record<string, string[]> = {
  LTXV2: ['LTXV2'],
  LTXV23: ['LTXV 2.3'],
  LTXV25: ['LTXV 2.5', 'LTXV 2.3'],
  WanVideo14B_T2V: [
    'Wan Video 14B t2v',
    'Wan Video 2.2 TI2V-5B',
    'Wan Video 2.2 I2V-A14B',
    'Wan Video 2.2 T2V-A14B',
  ],
};

export function getAllVersionIds(group: VersionGroup): Set<number> {
  const ids = new Set<number>();
  const walk = (g: VersionGroup) => {
    for (const opt of g.options) {
      ids.add(opt.value);
      if (opt.children) walk(opt.children);
    }
  };
  walk(group);
  return ids;
}
