import type { Codec, Schema, SchemaLike } from './types.js';


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
export function codec<T, M = undefined, C = never, O extends SchemaLike<T> = SchemaLike<T>>(
  def: Codec<T, M, C> & { output: O }
): Codec<T, M, C> & { output: O } {
  return def;
}

export type InferCodecValue<C> = C extends Codec<infer T, infer _M, infer _C> ? T : never;
export type InferCodecMeta<C> = C extends Codec<infer _T, infer M, infer _C> ? M : never;
/** The constraint vocabulary a codec accepts via the `constrain:` field option. */
export type InferCodecConstraint<X> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  X extends Codec<infer _T, infer _M, infer C> ? C : never;

/**
 * The per-key inference pattern: the app declares one registry object mapping
 * field key -> codec (a union of codecs where branches differ), and these two
 * mapped types derive the flat Values/Meta lookup maps at O(1) type cost. The
 * registry doubles as the module-scope hoisting home the codec-churn rule
 * pushes toward.
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
 * A codec FAMILY: one declaration of a codec as a function of per-branch
 * parameters, memoized so each distinct parameter list builds exactly once.
 * This is how a field whose contract varies with a condition (per-resolution
 * aspect ratios, a per-tier bound) stays churn-free without hand-rolling a
 * dictionary of pre-built variants:
 *
 *   const AR = codecFamily((res: Resolution) =>
 *     aspectRatioCodec({ options: TABLE[res], default: '16:9' }));
 *   // in resolve:  f.field('aspectRatio', AR(resolution))
 *
 * Parameters must be primitives (they form the cache key) and should come
 * from a finite set — each distinct combination is cached for the module's
 * lifetime.
 */
export function codecFamily<
  Args extends readonly (string | number | boolean | null | undefined)[],
  C,
>(build: (...args: Args) => C): (...args: Args) => C {
  const cache = new Map<string, C>();
  return (...args: Args) => {
    const key = JSON.stringify(args);
    if (!cache.has(key)) cache.set(key, build(...args));
    return cache.get(key)!;
  };
}

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
