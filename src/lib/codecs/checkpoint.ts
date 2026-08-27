import { z } from 'zod';
import {
  codec,
  corrected,
  defineFieldKit,
  type FieldOptions,
  type Rule,
  type Scope,
} from '../core/index.js';
import { resourceSchema, type ResourceData, type ResourceValue } from './resources.js';
import {
  buildVersionMappings,
  filterVersionGroup,
  findWorkflowConfig,
  getAllVersionIds,
  getWorkflowKey,
  type VersionGroup,
  type WorkflowVersionConfig,
} from './versions.js';

/**
 * Port of createCheckpointGraph — v1's hardest node, restated in the resolver
 * model:
 *
 * - the locked-model substitution (observe-only, issue #3520) becomes
 *   `noteOnProject` — a resolution note replaces the mutable collector on ext
 * - the "model belongs to another ecosystem -> reset to default" transform and
 *   the workflow-version equivalence transform become `project`
 * - the three model-driven effects become reconciler rules
 *   (`checkpointReconciler`) — patch-aware, so the who-initiated ambiguity the
 *   v1 comments wrestle with does not exist
 * - gate filtering of the version picker stays derivation (meta), computed from
 *   the injected gate ids each pass
 *
 * Everything app-specific arrives through `CheckpointCatalog`, injected — the
 * real app passes its basemodel/workflow tables, tests pass tiny ones.
 */

export interface CheckpointCatalog {
  /** basemodel.constants: baseModel name -> ecosystem key. */
  ecosystemKeyForBaseModel(baseModel: string): string | undefined;
  /** Ecosystem defaults: default checkpoint + whether the picker is locked. */
  ecosystemDefaults(ecosystem: string): { modelId?: number; modelLocked?: boolean } | undefined;
  /** config/workflows: can this workflow run on this ecosystem? */
  isWorkflowAvailable(workflow: string, ecosystem: string): boolean;
  /** config/workflows: workflows for an ecosystem, primary first. */
  workflowsForEcosystem(ecosystem: string): string[];
  /** Workflow variants: parent workflow + versions the variant excludes. */
  workflowVariant(workflow: string): { variantOf?: string; excludeModelVersionIds?: number[] } | undefined;
}

export const CHECKPOINT = codec<ResourceValue | undefined, CheckpointMeta>({
  input: z
    .union([
      z.number().transform((id) => ({ id })),
      z.looseObject({ id: z.number(), baseModel: z.string().optional() }),
    ])
    .optional()
    .transform((val): ResourceValue | undefined =>
      val && !('model' in val && val.model)
        ? ({ ...val, model: { type: 'Checkpoint' } } as ResourceValue)
        : (val as ResourceValue | undefined)
    ),
  output: resourceSchema.optional() as unknown as z.ZodType<ResourceValue | undefined>,
});

/** Why a substitution fired — carried on the note; v1 reconstructs this post-hoc. */
export type SubstitutionReason = 'locked_default' | 'ecosystem_mismatch' | 'workflow_version_swap';

export interface CheckpointMeta {
  options: { canGenerate: boolean; excludeIds: number[] };
  modelLocked: boolean;
  versions: VersionGroup | undefined;
  defaultModelId: number | undefined;
}

/** Static configuration a checkpoint kit closes over — shared by field AND reconciler. */
export interface CheckpointKitConfig {
  catalog: CheckpointCatalog;
  versions?: VersionGroup;
  defaultModelId?: number;
  workflowVersions?: WorkflowVersionConfig;
  /**
   * Branch guard for the reconciler. Kits belong to one ecosystem's module but
   * reconciler rules run globally, so a kit whose rules only apply on its own
   * branch says so here (v1 gets this for free from branch mount/unmount).
   */
  appliesTo?: (state: { ecosystem?: string }) => boolean;
}

/** Per-resolve arguments — the dynamic bits the resolver computes each pass. */
export interface CheckpointFieldArgs {
  ctx: { workflow: string; ecosystem: string };
  modelLocked?: boolean;
  /** Context-dependent default (e.g. the draft workflow forces the draft build). */
  defaultModelId?: number;
  /** Gated version ids (from gate rules) — hidden from the picker. */
  gatedVersionIds?: readonly number[];
  /** Remember the selection per this scope (v1: per ecosystem group). */
  scope?: Scope;
}

interface CheckpointArgs extends CheckpointFieldArgs {
  catalog: CheckpointCatalog;
  versions?: VersionGroup;
  defaultModelId?: number;
  workflowVersions?: WorkflowVersionConfig;
}

const asCheckpoint = (id: number, baseModel?: string): ResourceData => ({
  id,
  ...(baseModel ? { baseModel } : {}),
  model: { type: 'Checkpoint' },
});

/**
 * The checkpoint kit, defined through the library's base factory. The spec is
 * the whole anatomy: key + codec + per-pass options + the rules that travel
 * with the field. `defineFieldKit` resolves the codec once, wires `f.field`,
 * and guarantees a reconciler is always present for uniform rule arrays.
 */
export const createCheckpointKit = defineFieldKit<
  CheckpointKitConfig,
  CheckpointFieldArgs,
  ResourceValue | undefined,
  CheckpointMeta,
  { workflow?: string; ecosystem?: string }
>({
  key: 'model',
  codec: CHECKPOINT,
  options: (config, args) =>
    checkpointOptions({
      ...config,
      ...args,
      defaultModelId: args.defaultModelId ?? config.defaultModelId,
    }),
  scope: (config) => config.appliesTo,
  rules: (config) => ({
    model: checkpointModelRule(config.catalog, config.workflowVersions),
  }),
});

/** Per-pass options — createCheckpointGraph's node factory, minus the plumbing. */
function checkpointOptions(args: CheckpointArgs): FieldOptions<ResourceValue | undefined, CheckpointMeta> {
  const { ctx, catalog } = args;

  const workflowConfig = findWorkflowConfig(args.workflowVersions, ctx.workflow);
  const versions = workflowConfig?.versions ?? args.versions;
  const defaults = catalog.ecosystemDefaults(ctx.ecosystem);
  const defaultModelId = workflowConfig?.defaultModelId ?? args.defaultModelId ?? defaults?.modelId;
  const modelLocked = args.modelLocked ?? defaults?.modelLocked ?? false;

  const visibleVersions =
    versions && args.gatedVersionIds?.length
      ? filterVersionGroup(versions, args.gatedVersionIds)
      : versions;
  const validVersionIds = visibleVersions ? getAllVersionIds(visibleVersions) : undefined;

  const mappings = args.workflowVersions ? buildVersionMappings(args.workflowVersions) : undefined;
  const allMappedIds = mappings ? new Set(mappings.keys()) : undefined;

  // The clause that fires IS the reason — classified at the source, where v1
  // needs a post-hoc classifier (workflow-capability probing) to reconstruct
  // why a substitution happened.
  const classify = (model: { id?: number; baseModel?: string } | undefined): SubstitutionReason | undefined => {
    if (!model?.id) return undefined;
    if (
      modelLocked &&
      defaultModelId !== undefined &&
      model.id !== defaultModelId &&
      !validVersionIds?.has(model.id)
    ) {
      return 'locked_default';
    }
    if (model.baseModel) {
      const modelEcosystem = catalog.ecosystemKeyForBaseModel(model.baseModel);
      if (modelEcosystem && modelEcosystem !== ctx.ecosystem) return 'ecosystem_mismatch';
    }
    if (mappings && allMappedIds?.has(model.id) && args.workflowVersions) {
      const workflowKey = getWorkflowKey(args.workflowVersions, ctx.workflow);
      const target = args.workflowVersions[workflowKey];
      if (target && !getAllVersionIds(target.versions).has(model.id)) return 'workflow_version_swap';
    }
    return undefined;
  };

  return {
    scope: args.scope,
    default: defaultModelId !== undefined ? asCheckpoint(defaultModelId) : undefined,
    // v1 records the locked substitution through ext.modelSubstitutions
    // (observe-only, must not change behaviour). `corrected` carries the same
    // record — WHICH substitute and WHY decided in one place.
    correct: (model) => {
      const context = { ecosystem: ctx.ecosystem, workflow: ctx.workflow, requested: model?.id };
      switch (classify(model)) {
        case 'locked_default':
        case 'ecosystem_mismatch':
          return defaultModelId !== undefined
            ? corrected(asCheckpoint(defaultModelId), classify(model)!, context)
            : model;
        case 'workflow_version_swap': {
          const workflowKey = getWorkflowKey(args.workflowVersions, ctx.workflow);
          const equivalent = mappings!.get(model!.id!)?.[workflowKey];
          return equivalent
            ? corrected(
                asCheckpoint(equivalent.id, equivalent.baseModel),
                'workflow_version_swap',
                context
              )
            : model;
        }
        default:
          return model;
      }
    },
    meta: (value): CheckpointMeta => ({
      options: { canGenerate: true, excludeIds: value ? [value.id] : [] },
      modelLocked,
      versions: visibleVersions,
      defaultModelId,
    }),
  };
}

/**
 * The three model-driven effects of createCheckpointGraph, as one `model` rule.
 * Each clause mirrors a v1 effect.
 */
function checkpointModelRule<State extends { workflow?: string; ecosystem?: string }>(
  catalog: CheckpointCatalog,
  workflowVersions?: WorkflowVersionConfig
): Rule<State, unknown, { id?: number; baseModel?: string } | undefined> {
  return (model, { patch, state }) => {
      if (!model?.id) return;
      const modelId = model.id;
      const workflow = (patch.workflow as string | undefined) ?? state.workflow ?? '';

      // Effect 1: model from another ecosystem -> switch ecosystem (and
      // workflow too when the current one can't run there).
      if (model.baseModel) {
        const targetEcosystem = catalog.ecosystemKeyForBaseModel(model.baseModel);
        if (targetEcosystem && targetEcosystem !== state.ecosystem) {
          if (catalog.isWorkflowAvailable(workflow, targetEcosystem)) {
            return { ecosystem: targetEcosystem };
          }
          const [fallback] = catalog.workflowsForEcosystem(targetEcosystem);
          if (fallback) return { ecosystem: targetEcosystem, workflow: fallback };
          return;
        }
      }

      // Effect 2: model excluded by the current workflow VARIANT -> parent workflow.
      const variant = catalog.workflowVariant(workflow);
      if (variant?.variantOf && variant.excludeModelVersionIds?.includes(modelId)) {
        return { workflow: variant.variantOf };
      }

      // Effect 3: model offered by a different workflow's version list -> switch
      // to it (model page "Generate" / remix landing on the right workflow).
      if (workflowVersions) {
        const currentKey = getWorkflowKey(workflowVersions, workflow);
        const current = workflowVersions[currentKey];
        if (current && getAllVersionIds(current.versions).has(modelId)) return;
        const targetKey = Object.keys(workflowVersions).find((key) =>
          getAllVersionIds(workflowVersions[key]!.versions).has(modelId)
        );
        if (targetKey && targetKey !== currentKey) return { workflow: targetKey };
      }
    };
}
