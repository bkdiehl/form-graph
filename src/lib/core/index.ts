/**
 * The public surface. Three tiers, deliberately small:
 *
 * - Authoring: defineGraph / branch / branchOn (the runtime lives on the
 *   definitions), defineForm for hand-written resolvers, plus the types an
 *   author writes against.
 * - Runtime: store types and storage adapters. `FormStore` is type-only —
 *   stores are created via `form.createStore()`, never constructed directly.
 * - Introspection & migration: branch enumeration and the persisted-intent
 *   readers.
 *
 * Engine internals (resolve, compileRules, runSchema, validateResolution,
 * diffSnapshot, the intent entry constructors, deepEqual) are NOT exported:
 * every published signature is frozen at the first release, and consumers
 * reach all of them through the form definition. Package-internal code imports
 * them from their modules directly.
 */
export {
  codec,
  codecFamily,
  type CodecRegistry,
  type InferCodecValue,
  type InferCodecMeta,
  type RegistryMetas,
  type RegistryValues,
} from './codec.js';
export { defineGraph, branch, branchOn, type Graph, type GraphLike,
  type GraphSource, type FieldDef, type AnyFieldDef } from './graph.js';
export { slider, enumOf, textOf, boolOf, type EnumDefOption, type EnumDefMeta, type SliderDefMeta } from './def-helpers.js';
export {
  defineForm,
  type CodecsInput,
  type CreateStoreArgs,
  type FormDefinition,
  type FormConfig,
  type NormalizeCodecs,
  type InferState,
  type InferExt,
  type InferCodecs,
  type InferFieldValue,
} from './form.js';
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
export type { Fields, FieldOptions, Resolver, Resolution } from './resolve.js';
export type { FormStore, StorageAdapter, StoreOptions } from './store.js';
export {
  type Rule,
  type RuleCtx,
  type RuleMap,
  type EffectFn,
  type RuleUnit,
} from './rules.js';
export { debouncedStorage, persistedStorage, type DebouncedStorageAdapter } from './storage.js';
export { readIntentBuckets, readIntentValue, type Scope, type ScopeValue } from './scope.js';
export type {
  Codec,
  FieldError,
  Refinable,
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
