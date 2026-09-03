/**
 * The public surface — the GRAPH MODEL and its runtime, deliberately small:
 *
 * - Authoring: defineGraph / branch (the runtime — createStore,
 *   parse — lives on the definitions), the def helpers via `form-graph/defs`,
 *   defFamily, and the types an author writes against.
 * - Runtime: store types and storage adapters. `FormStore` is type-only —
 *   stores are created via `graph.createStore()`, never constructed directly.
 * - Introspection & migration: branch enumeration and the persisted-intent
 *   readers.
 *
 * The ENGINE is not exported at all — defineForm, FormDefinition, codec(),
 * Fields/FieldOptions, the resolver internals. Every form is expressible as a
 * graph (the generation-scale hub included, proven by the parity suite), so
 * the engine is an implementation layer: package-internal code and the
 * corpus import it from its modules directly; the exports map makes it
 * unreachable for consumers.
 */
export { defFamily, type InferDefValue, type InferDefMeta } from './codec.js';
export {
  defineGraph,
  branch,
  type DefInputValue,
  type Graph,
  type GraphOptions,
  type InferData,
  type InferState,
  type InferArm,
  type InferLooseData,
  type GraphLike,
  type GraphSource,
  type FieldDef,
  type AnyFieldDef,
} from './graph.js';
export {
  cachedFactory,
  defineDef,
  slider,
  enumOf,
  textOf,
  boolOf,
  type EnumDefOption,
  type EnumDefMeta,
  type SliderDefMeta,
} from './def-helpers.js';
export { type InferDefs, type InferFieldValue } from './form.js';
export type { Intent, IntentEntry } from './intent.js';
export {
  allPossibleKeys,
  enumerateBranches,
  fieldKeys,
  fieldMeta,
  hasField,
  optionsFor,
  whereFieldExists,
  type BranchDescription,
  type Pins,
} from './introspect.js';
export type { FormStore, StorageAdapter, StoreOptions } from './store.js';
export { type Rule, type RuleCtx, type RuleMap, type EffectFn, type RuleUnit } from './rules.js';
export { debouncedStorage, persistedStorage, type DebouncedStorageAdapter } from './storage.js';
export {
  readIntentBuckets,
  readIntentValue,
  rootScope,
  scopedAddress,
  type RootScope,
  type Scope,
  type ScopeValue,
} from './scope.js';
export type {
  FieldError,
  ResolutionNote,
  FieldRecord,
  FieldSnapshot,
  SafeParseResult,
  Schema,
  SchemaIssue,
  SchemaLike,
  Snapshot,
  StandardSchemaResult,
  StandardSchemaV1,
  ValidationResult,
} from './types.js';
