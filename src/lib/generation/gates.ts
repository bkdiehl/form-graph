import { z } from 'zod';

/**
 * Port of src/shared/data-graph/generation/gates.ts — pure zod + maps, no
 * engine dependency, so it carries over near-verbatim. The server narrows
 * stored rules per user (applicableRulesFor); the graph folds the applicable
 * list into per-item states (rulesToStates + mergeGateStates).
 */

export const gateAvailableToSchema = z.enum(['moderators', 'testers', 'members', 'nobody']);
export type GateAvailableTo = z.infer<typeof gateAvailableToSchema>;

export const gatePresentationSchema = z.enum(['disabled', 'hidden', 'experimental']);
export type GatePresentation = z.infer<typeof gatePresentationSchema>;

export const gateRuleSchema = z.object({
  id: z.string(),
  name: z.string().default(''),
  availableTo: gateAvailableToSchema,
  presentation: gatePresentationSchema,
  message: z.string().nullish(),
  ecosystems: z.array(z.string()).default([]),
  workflows: z.array(z.string()).default([]),
  modelVersionIds: z.array(z.number().int().positive()).default([]),
});
export type GateRule = z.infer<typeof gateRuleSchema>;

export type GateUserCtx = {
  isModerator: boolean;
  isMember: boolean;
  hasTestingAccess: boolean;
};

const isGatedFor: Record<GateAvailableTo, (u: GateUserCtx) => boolean> = {
  moderators: (u) => !u.isModerator,
  testers: (u) => !u.hasTestingAccess,
  members: (u) => !u.isMember && !u.isModerator,
  nobody: () => true,
};

/** SERVER: narrow rules to those that gate this user; experimental always survives. */
export function applicableRulesFor(rules: GateRule[], user: GateUserCtx): GateRule[] {
  return rules.filter((r) => r.presentation === 'experimental' || isGatedFor[r.availableTo](user));
}

export type GateState = 'hidden' | 'disabled' | 'memberOnly';
export type GateResolution = { state: GateState; message?: string };
export type GateItemState = { key: string; state: Exclude<GateState, 'hidden'>; message?: string };

export type ResolvedGates = {
  ecosystems: Map<string, GateResolution>;
  workflows: Map<string, GateResolution>;
  modelVersionIds: Map<number, GateResolution>;
};

// hidden (gone) > disabled (off for all) > memberOnly (off for non-members)
const STATE_RANK: Record<GateState, number> = { hidden: 2, disabled: 1, memberOnly: 0 };

export function pickStrongerGate(a: GateResolution | undefined, b: GateResolution): GateResolution {
  return !a || STATE_RANK[b.state] > STATE_RANK[a.state] ? b : a;
}

export function mergeGateStates(
  legacyDisabled: string[] | undefined,
  ruleStates: Map<string, GateResolution>
): { hidden: string[]; states: GateItemState[] } {
  const map = new Map<string, GateResolution>();
  for (const key of legacyDisabled ?? [])
    map.set(key, pickStrongerGate(map.get(key), { state: 'disabled' }));
  for (const [key, res] of ruleStates) map.set(key, pickStrongerGate(map.get(key), res));
  const hidden = [...map].filter(([, r]) => r.state === 'hidden').map(([key]) => key);
  const states = [...map]
    .filter(([, r]) => r.state !== 'hidden')
    .map(([key, r]) => ({ key, state: r.state as GateItemState['state'], message: r.message }));
  return { hidden, states };
}

const ruleState = (rule: GateRule): GateState =>
  rule.presentation === 'hidden' ? 'hidden' : rule.availableTo === 'members' ? 'memberOnly' : 'disabled';

/** Target -> the rule's optional extra copy for the experimental alert. */
export type ExperimentalTargets = {
  ecosystems: Map<string, string | undefined>;
  workflows: Map<string, string | undefined>;
  modelVersionIds: Map<number, string | undefined>;
};

export function experimentalTargets(rules: GateRule[]): ExperimentalTargets {
  const targets: ExperimentalTargets = {
    ecosystems: new Map(),
    workflows: new Map(),
    modelVersionIds: new Map(),
  };
  for (const rule of rules) {
    if (rule.presentation !== 'experimental') continue;
    const message = rule.message ?? undefined;
    for (const e of rule.ecosystems) targets.ecosystems.set(e, message);
    for (const w of rule.workflows) targets.workflows.set(w, message);
    for (const id of rule.modelVersionIds) targets.modelVersionIds.set(id, message);
  }
  return targets;
}

/**
 * Stable per-(target, message) dismissal id — an edited warning re-notifies
 * everyone who dismissed the previous wording (pinned in v1's
 * experimental.test.ts).
 */
export function experimentalDismissId(target: { kind: string; key: string | number }, message?: string): string {
  let hash = 5381;
  const text = message ?? '';
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${target.kind}:${target.key}:${hash >>> 0}`;
}

/** GRAPH: fold applicable rules into one effective gate per target; experimental skipped. */
export function rulesToStates(rules: GateRule[]): ResolvedGates {
  const ecosystems = new Map<string, GateResolution>();
  const workflows = new Map<string, GateResolution>();
  const modelVersionIds = new Map<number, GateResolution>();

  for (const rule of rules) {
    if (rule.presentation === 'experimental') continue;
    const resolution: GateResolution = { state: ruleState(rule), message: rule.message ?? undefined };
    for (const e of rule.ecosystems) ecosystems.set(e, pickStrongerGate(ecosystems.get(e), resolution));
    for (const w of rule.workflows) workflows.set(w, pickStrongerGate(workflows.get(w), resolution));
    for (const id of rule.modelVersionIds)
      modelVersionIds.set(id, pickStrongerGate(modelVersionIds.get(id), resolution));
  }
  return { ecosystems, workflows, modelVersionIds };
}
