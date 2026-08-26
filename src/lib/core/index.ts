/**
 * The public surface. Three tiers, deliberately small:
 *
 * - Authoring: defineForm / defineFieldKit / defineRules / codec, plus the
 *   types a resolver or kit author writes against.
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
  type CodecRegistry,
  type InferCodecValue,
  type InferCodecMeta,
  type RegistryMetas,
  type RegistryValues,
} from './codec.js';
export { defineFieldKit, type FieldKit, type FieldKitSpec } from './field-kit.js';
export {
  defineForm,
  type FormDefinition,
  type FormConfig,
  type InferState,
  type InferExt,
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
export type { Fields, FieldOptions, Resolver, Resolution, ResolutionNote } from './resolve.js';
export type { FormStore, StorageAdapter, StoreOptions } from './store.js';
export {
  defineRules,
  type Rule,
  type RuleCtx,
  type RuleMap,
  type RulesSpec,
  type RuleUnit,
} from './rules.js';
export { debouncedStorage, type DebouncedStorageAdapter } from './storage.js';
export { readIntentBuckets, readIntentValue, type Scope, type ScopeValue } from './scope.js';
export type {
  Codec,
  FieldError,
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
