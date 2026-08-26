import type { GateRule } from './gates.js';

/**
 * Trimmed-but-real-shaped tables for the phase-3 covering set. Real workflow
 * keys and flux version ids; the six graphs exercise every mechanism, and the
 * remaining ~40 ecosystems are additions to these tables, not new code shapes.
 */

export interface WorkflowConfig {
  key: string;
  output: 'image' | 'video';
  input: 'text' | 'image' | 'video';
  /** Ecosystem ids that can run this workflow; absent = no ecosystem support. */
  ecosystems?: number[];
}

export const ECOSYSTEMS = {
  Flux1: { id: 5, key: 'Flux1', group: 'flux', baseModels: ['Flux.1 S', 'Flux.1 D'] },
  SD1: { id: 1, key: 'SD1', group: 'sd', baseModels: ['SD 1.5'] },
  SDXL: { id: 2, key: 'SDXL', group: 'sd', baseModels: ['SDXL 1.0', 'Pony'] },
  LTXV2: { id: 20, key: 'LTXV2', group: 'ltx', baseModels: ['LTXV2'] },
  LTXV23: { id: 21, key: 'LTXV23', group: 'ltx', baseModels: ['LTXV23'] },
  NanoBanana: { id: 30, key: 'NanoBanana', group: 'nano-banana', baseModels: ['Nano Banana'] },
  // The wan 2.1 shape: 480p/720p are SEPARATE ECOSYSTEMS behind one resolution
  // picker — choosing a resolution switches the ecosystem (gap 2).
  WanV21_480p: { id: 40, key: 'WanV21_480p', group: 'wan', baseModels: ['Wan Video'] },
  WanV21_720p: { id: 41, key: 'WanV21_720p', group: 'wan', baseModels: ['Wan Video 720p'] },
} as const;

export type EcosystemKey = keyof typeof ECOSYSTEMS;

export const ecosystemByKey = new Map<string, (typeof ECOSYSTEMS)[EcosystemKey]>(
  Object.entries(ECOSYSTEMS) as [string, (typeof ECOSYSTEMS)[EcosystemKey]][]
);
export const baseModelToEcosystem = new Map<string, EcosystemKey>(
  Object.values(ECOSYSTEMS).flatMap((eco) =>
    eco.baseModels.map((bm) => [bm, eco.key as EcosystemKey] as const)
  )
);

export const WORKFLOWS: WorkflowConfig[] = [
  { key: 'txt2img', output: 'image', input: 'text', ecosystems: [5, 1, 2, 30] },
  { key: 'txt2img:draft', output: 'image', input: 'text', ecosystems: [5, 1, 2] },
  { key: 'img2img:edit', output: 'image', input: 'image', ecosystems: [30] },
  { key: 'txt2vid', output: 'video', input: 'text', ecosystems: [20, 21, 40, 41] },
  { key: 'img2vid', output: 'video', input: 'image', ecosystems: [20, 21, 40, 41] },
  { key: 'img2vid:ref2vid', output: 'video', input: 'image', ecosystems: [21] },
  { key: 'img2img:upscale', output: 'image', input: 'image' },
];

export const workflowConfigByKey = new Map(WORKFLOWS.map((w) => [w.key, w]));

/** Old localStorage keys migrate onto current ones (v1's migrateWorkflowKey). */
const WORKFLOW_ALIASES: Record<string, string> = {
  'image:create': 'txt2img',
  'image:draft': 'txt2img:draft',
  'image:upscale': 'img2img:upscale',
  'video:create': 'txt2vid',
};

export function migrateWorkflowKey(key: string | undefined): string | undefined {
  if (!key) return key;
  const resolved = WORKFLOW_ALIASES[key] ?? key;
  return workflowConfigByKey.has(resolved) ? resolved : 'txt2img';
}

export const getOutputTypeForWorkflow = (key: string) =>
  workflowConfigByKey.get(key)?.output ?? 'image';
export const getInputTypeForWorkflow = (key: string) =>
  workflowConfigByKey.get(key)?.input ?? 'text';

export function isWorkflowAvailable(workflowKey: string, ecosystemKey: string): boolean {
  const workflow = workflowConfigByKey.get(workflowKey);
  const ecosystem = ecosystemByKey.get(ecosystemKey);
  if (!workflow?.ecosystems || !ecosystem) return false;
  return workflow.ecosystems.includes(ecosystem.id);
}

export function getEcosystemsForWorkflow(workflowKey: string): EcosystemKey[] {
  const workflow = workflowConfigByKey.get(workflowKey);
  if (!workflow?.ecosystems) return [];
  return (Object.keys(ECOSYSTEMS) as EcosystemKey[]).filter((key) =>
    workflow.ecosystems!.includes(ECOSYSTEMS[key].id)
  );
}

export function getWorkflowsForEcosystem(ecosystemKey: string): string[] {
  const ecosystem = ecosystemByKey.get(ecosystemKey);
  if (!ecosystem) return [];
  return WORKFLOWS.filter((w) => w.ecosystems?.includes(ecosystem.id)).map((w) => w.key);
}

export const getDefaultEcosystemForWorkflow = (workflowKey: string): EcosystemKey | undefined =>
  getEcosystemsForWorkflow(workflowKey)[0];

/** Real Flux.1 version ids (v1 flux-graph.ts). */
export const fluxVersionIds = {
  draft: 699279,
  standard: 691639,
  pro: 922358,
  krea: 2068000,
  ultra: 1088507,
} as const;

export type GenerationExt = {
  limits: { maxQuantity: number; maxResources: number; vidQuantity: number };
  user: { isMember: boolean; tier: 'free' | 'founder' | 'bronze' | 'silver' | 'gold' };
  gateRules?: GateRule[];
  /** Self-hosted ecosystems off for THIS user (resolved server-side, like v1). */
  selfHostedDisabledEcosystems?: string[];
  selfHostedMode?: 'enabled' | 'disabled' | 'memberOnly';
};

export const defaultExt: GenerationExt = {
  limits: { maxQuantity: 4, maxResources: 9, vidQuantity: 1 },
  user: { isMember: true, tier: 'gold' },
  gateRules: [],
};
