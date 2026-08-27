import { z } from 'zod';
import { codec, defineForm, defineRules, type Fields } from '../core/index.js';
import { mergeGateStates, rulesToStates, type GateRule } from '../generation/gates.js';
import {
  VID_QUANTITY_ECOSYSTEMS,
  generationWorkflowsForEcosystem,
  migrateWorkflowKey,
  wanEcosystemToVersion,
} from './constants.js';
import { ltxCoupling, ltxResolver } from './ltx.js';
import { wanCoupling, wanResolver } from './wan.js';

/**
 * The hub slice of v1's generation-graph + ecosystem-graph for the two video
 * families this port covers (LTX + Wan). Mirrors what v1's parse produces for
 * these branches: workflow (with key migration + gate refusal), computed
 * output/input, ecosystem (gates only — v1 does NOT correct a
 * workflow-incompatible ecosystem at parse time; that's an effect, which here
 * is a rule), and quantity only for the video ecosystems that batch
 * (VID_QUANTITY_ECOSYSTEMS). priority/outputFormat are image-only in v1 and so
 * never appear here.
 */

export interface VideoExt {
  limits: { maxQuantity: number; maxResources: number; vidQuantity: number };
  user: { isMember: boolean; tier?: string };
  gateRules?: GateRule[];
  flags?: Record<string, boolean>;
}

export interface VideoHubCtx {
  workflow: string;
  ecosystem: string;
}

const WORKFLOW = codec({
  input: z.string().optional().transform(migrateWorkflowKey),
  output: z.string(),
  default: 'txt2vid',
});

const ECOSYSTEM = codec({
  input: z.string().optional(),
  output: z.string(),
});

const quantityCodecCache = new Map<number, ReturnType<typeof buildQuantityCodec>>();
function buildQuantityCodec(max: number) {
  const snap = (val: number) => Math.min(Math.max(Math.round(val), 1), max);
  return codec<number, { min: number; max: number; step: number }>({
    input: z.coerce
      .number()
      .optional()
      .transform((val) => (val === undefined ? undefined : snap(val))),
    output: z.number().min(1).max(max),
    default: 1,
    meta: { min: 1, max, step: 1 },
  });
}
function quantityCodecFor(max: number) {
  let cached = quantityCodecCache.get(max);
  if (!cached) {
    cached = buildQuantityCodec(max);
    quantityCodecCache.set(max, cached);
  }
  return cached;
}

const LTX_ECOSYSTEMS = new Set(['LTXV2', 'LTXV23', 'LTXV25']);

function resolveVideo(f: Fields, ext: VideoExt) {
  const { hidden, states } = mergeGateStates(undefined, rulesToStates(ext.gateRules ?? []).workflows);
  const gatedWorkflows = new Set([...hidden, ...states.map((s) => s.key)]);
  const gatedWorkflowKey = [...gatedWorkflows].sort().join('|');
  const workflow = f.field('workflow', WORKFLOW, {
    refine: (s) =>
      s.refine((key) => !gatedWorkflows.has(key), {
        message: 'Workflow is currently unavailable',
        params: { kind: 'gated' },
      }),
    refineDeps: [gatedWorkflowKey],
  });

  const output = f.computed('output', 'video' as const);
  const input = f.computed(
    'input',
    workflow.startsWith('txt') ? ('text' as const) : workflow.startsWith('img') ? ('image' as const) : ('video' as const)
  );

  const ecoRuleStates = rulesToStates(ext.gateRules ?? []).ecosystems;
  const hiddenEcos = [...ecoRuleStates].filter(([, r]) => r.state === 'hidden').map(([k]) => k);
  const gatedEcos = new Set(ecoRuleStates.keys());
  const gatedEcoKey = [...gatedEcos].sort().join('|');
  // v1 drops HIDDEN ecosystems at the input boundary (stale localStorage) but
  // keeps disabled/memberOnly so the picker can explain; both reject at
  // output. It does NOT correct workflow-incompatibility at parse time.
  let ecosystem = f.field('ecosystem', ECOSYSTEM, {
    refine: (s) =>
      s.refine((key) => !gatedEcos.has(key), {
        message: 'Ecosystem is currently unavailable',
        params: { kind: 'gated' },
      }),
    refineDeps: [gatedEcoKey],
    default: 'LTXV23',
  });
  if (hiddenEcos.includes(ecosystem)) {
    ecosystem = f.correct('ecosystem', 'LTXV23', 'hidden_ecosystem');
  }

  const quantity = VID_QUANTITY_ECOSYSTEMS.has(ecosystem)
    ? { quantity: f.field('quantity', quantityCodecFor(ext.limits.vidQuantity)) }
    : {};

  const head = { workflow, output, input, ...quantity };
  const ctx: VideoHubCtx = { workflow, ecosystem };

  if (wanEcosystemToVersion.has(ecosystem)) {
    return { ...head, ...wanResolver(f, ext, ctx) };
  }
  return { ...head, ...ltxResolver(f, ext, ctx) };
}

type HubRuleState = { workflow?: string; ecosystem?: string };

/**
 * v1's two ecosystem-graph effects: workflow change corrects an incompatible
 * ecosystem; ecosystem change corrects an incompatible workflow. Restricted
 * to the two ported families.
 */
const createVideoHubCoupling = defineRules<void, HubRuleState>({
  rules: () => ({
    workflow: (workflow: string, { patch, state }) => {
      if ('ecosystem' in patch) return;
      const eco = state.ecosystem ?? '';
      const supported = generationWorkflowsForEcosystem[eco] ?? [];
      if (supported.includes(workflow)) return;
      // Wan handles T2V↔I2V internally (workflow-group override in v1) —
      // leave those to wanCoupling.
      if (wanEcosystemToVersion.has(eco) && (workflow === 'txt2vid' || workflow === 'img2vid')) {
        return;
      }
      const target = Object.entries(generationWorkflowsForEcosystem).find(([, wfs]) =>
        wfs.includes(workflow)
      )?.[0];
      if (target && target !== eco) return { ecosystem: target };
    },
    ecosystem: (ecosystem: string, { state }) => {
      const supported = generationWorkflowsForEcosystem[ecosystem] ?? [];
      const workflow = state.workflow ?? '';
      if (supported.includes(workflow) || supported.length === 0) return;
      return { workflow: supported[0]! };
    },
  }),
});
export const videoHubCoupling = createVideoHubCoupling();

export const videoForm = defineForm<VideoExt>()({
  resolve: resolveVideo,
  reconcile: [videoHubCoupling, wanCoupling, ltxCoupling],
});

export type VideoState = ReturnType<typeof videoForm.resolve>['state'];
export { LTX_ECOSYSTEMS };
