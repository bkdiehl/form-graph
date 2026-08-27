/**
 * Port of common.ts's version-group machinery: hierarchical version options
 * (precision -> variant), gate filtering, and the index-based equivalence
 * mapping that moves a checkpoint to its counterpart when the workflow changes
 * (fast->fast, standard->standard).
 */

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

export type WorkflowVersionConfig = Record<
  string,
  { versions: VersionGroup; defaultModelId: number }
>;

export function getAllVersionIds(group: VersionGroup): Set<number> {
  const ids = new Set<number>();
  const collect = (g: VersionGroup) => {
    for (const opt of g.options) {
      ids.add(opt.value);
      if (opt.children) collect(opt.children);
    }
  };
  collect(group);
  return ids;
}

/**
 * Removes gated options. A parent whose own id is gated is repointed at its
 * first surviving child; a parent with no surviving children is dropped.
 * Returns undefined when everything is gated.
 */
export function filterVersionGroup(
  group: VersionGroup,
  hiddenIds: readonly number[]
): VersionGroup | undefined {
  if (hiddenIds.length === 0) return group;
  const options: VersionOption[] = [];
  for (const opt of group.options) {
    if (opt.children) {
      const children = filterVersionGroup(opt.children, hiddenIds);
      if (!children) continue;
      const value = hiddenIds.includes(opt.value) ? children.options[0]!.value : opt.value;
      options.push({ ...opt, value, children });
    } else if (!hiddenIds.includes(opt.value)) {
      options.push(opt);
    }
  }
  return options.length === 0 ? undefined : { ...group, options };
}

/** Exact key match first, then prefix ('img2vid:ref2vid' matches 'img2vid'). */
export function findWorkflowConfig(
  workflowVersions: WorkflowVersionConfig | undefined,
  workflow: string | undefined
): { versions: VersionGroup; defaultModelId: number } | undefined {
  if (!workflowVersions || !workflow) return undefined;
  if (workflowVersions[workflow]) return workflowVersions[workflow];
  for (const key of Object.keys(workflowVersions)) {
    if (workflow.startsWith(key)) return workflowVersions[key];
  }
  return undefined;
}

export function getWorkflowKey(
  workflowVersions: WorkflowVersionConfig | undefined,
  workflow: string | undefined
): string {
  if (!workflowVersions || !workflow) return '';
  if (workflowVersions[workflow]) return workflow;
  for (const key of Object.keys(workflowVersions)) {
    if (workflow.startsWith(key)) return key;
  }
  return workflow;
}

export interface VersionMapping {
  id: number;
  baseModel?: string;
}

/** Index-based equivalence across workflows (first option maps to first, …). */
export function buildVersionMappings(
  workflowVersions: WorkflowVersionConfig
): Map<number, Record<string, VersionMapping>> {
  const mappings = new Map<number, Record<string, VersionMapping>>();
  const workflows = Object.keys(workflowVersions);

  for (const source of workflows) {
    const sourceOptions = workflowVersions[source]!.versions.options;
    for (let i = 0; i < sourceOptions.length; i++) {
      const equivalents: Record<string, VersionMapping> = {};
      for (const target of workflows) {
        if (target === source) continue;
        const targetOption = workflowVersions[target]!.versions.options[i];
        if (targetOption) {
          equivalents[target] = { id: targetOption.value, baseModel: targetOption.baseModel };
        }
      }
      mappings.set(sourceOptions[i]!.value, equivalents);
    }
  }
  return mappings;
}
