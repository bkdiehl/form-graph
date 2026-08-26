import type { Codec, Schema } from './types.js';

/**
 * Identity helper that pins `T`/`M` inference for a codec literal.
 *
 * @typeParam T - The field STATE value type this codec describes: what the
 *   input schema must produce (or `undefined`, meaning "fall to the default"),
 *   what `default`/`coerce`/`project` traffic in, and what the output schema
 *   validates. Annotate it — it is the codec's contract.
 * @typeParam M - The meta shape (dynamic UI props) this codec publishes.
 *   Defaults to `undefined` when controls need nothing computed; inferred from
 *   `meta` when the literal provides one and the caller annotates it.
 */
export function codec<T, M = undefined>(def: Codec<T, M>): Codec<T, M> {
  return def;
}

export type InferCodecValue<C> = C extends Codec<infer T, infer _M> ? T : never;
export type InferCodecMeta<C> = C extends Codec<infer _T, infer M> ? M : never;

/**
 * The per-key inference pattern (rethink doc, decided Q8): the app declares one
 * registry object mapping field key -> codec (a union of codecs where branches
 * differ), and these two mapped types derive the flat Values/Meta lookup maps —
 * v1's CtxValues/CtxMeta — at O(1) type cost. The registry doubles as the
 * module-scope hoisting home the codec-churn rule pushes toward.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CodecRegistry = Record<string, Codec<any, any>>;

/** @typeParam R - The app's codec-registry literal (`typeof genCodecs`); keys are field names. */
export type RegistryValues<R extends CodecRegistry> = {
  [K in keyof R]: InferCodecValue<R[K]>;
};

/** @typeParam R - Same registry literal as {@link RegistryValues}. */
export type RegistryMetas<R extends CodecRegistry> = {
  [K in keyof R]: InferCodecMeta<R[K]>;
};

/**
 * Wraps a plain predicate as a Schema. Lets the core be exercised without zod —
 * the engine only ever needs `parse`/`safeParse`.
 */
export function schemaFrom<T>(
  check: (value: unknown) => value is T,
  message = 'Invalid value'
): Schema<T> {
  return {
    parse(value) {
      if (!check(value)) throw new Error(message);
      return value;
    },
    safeParse(value) {
      return check(value)
        ? { success: true, data: value }
        : { success: false, error: { issues: [{ message, code: 'invalid_type' }] } };
    },
  };
}
