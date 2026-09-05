import { deepEqual } from './deep-equal.js';
import { diffSnapshot } from './diff.js';
import { boundaryEntry, ephemeralEntry, trustedEntry, type IntentEntry, type ParseCache } from './intent.js';
import { addressKey } from './scope.js';
import { resolve, type Resolution, type Resolver } from './resolve.js';
import type { CodecRegistry } from './codec.js';
import { validateResolution } from './validate.js';
import { runSchema } from './run-schema.js';
import type {
  FieldError,
  FieldSnapshot,
  ResolutionNote,
  ScopedValidationResult,
  Snapshot,
  ValidationResult,
} from './types.js';

/** Registry-typed field keys; plain string when the store carries no registry. */
type FieldKeys<Codecs> = unknown extends Codecs ? string : keyof Codecs & string;

export interface StorageAdapter {
  load(): Record<string, unknown> | undefined;
  save(intent: Record<string, unknown>): void;
}

export type PatchReconciler<State, Ext> = (
  patch: Record<string, unknown>,
  state: State,
  ext: Ext
) => Record<string, unknown>;

export interface StoreOptions<Ext> {
  ext: Ext;
  /** Seed values — treated as boundary input, so their input schemas run. */
  defaults?: Record<string, unknown>;
  storage?: StorageAdapter;
  /** Set false to silence the codec-churn warning (see `getCodecChurn`). */
  warnOnCodecChurn?: boolean;
}

/** Consecutive passes of identity churn before a key is reported. */
const CHURN_STREAK_LIMIT = 3;

type Listener = () => void;

/**
 * Holds intent, resolves snapshots, and notifies per-field subscribers.
 *
 * The keystroke path is: write intent -> resolve -> diff -> notify changed keys.
 * No schema work happens in it (see docs/data-graph-rethink.md, "Keystroke budget").
 */
/**
 * @typeParam Codecs - Phantom registry carried from the FormDefinition so
 *   registry-driven binding helpers can infer per-key types from a store
 *   value alone. Never read at runtime.
 */
export class FormStore<State, Ext, Codecs = unknown, Data = State> {
  declare private __codecs?: Codecs;
  private intent = new Map<string, IntentEntry>();
  private cache: ParseCache = new WeakMap();
  private errors = new Map<string, FieldError>();
  private externalErrors = new Map<string, FieldError>();
  private resolution: Resolution<State>;
  private snapshot: Snapshot<State>;
  private ext: Ext;

  private keyListeners = new Map<string, Set<Listener>>();
  private globalListeners = new Set<Listener>();

  /**
   * Guards the one performance rule this design has: build codecs once, not per
   * pass. Constructing zod schemas inside a resolver made a 35-field keystroke
   * 152x more expensive in `src/__bench__/keystroke.bench.ts` (0.005ms -> 0.74ms),
   * and nothing else about the code looks wrong when it happens.
   *
   * A one-off identity change is legitimate (a branch switched, or a codec's
   * options genuinely depend on context), so only a sustained streak is reported.
   */
  private codecIdentity = new Map<string, { input: unknown; output: unknown }>();
  private codecChurnStreak = new Map<string, number>();
  private reportedChurn = new Set<string>();

  constructor(
    private readonly resolver: Resolver<Ext, State>,
    private readonly reconciler: PatchReconciler<State, Ext> | undefined,
    private readonly options: StoreOptions<Ext>,
    private readonly defs?: Codecs
  ) {
    this.ext = options.ext;

    // Storage entries were saved address-keyed (scoped addresses included), so
    // they rehydrate straight into intent. Explicit defaults (remix, URL
    // handoff) arrive by KEY and go through the pending flow, so a default for
    // a scoped field lands in the bucket the field actually resolves with —
    // explicit defaults win over storage.
    for (const [address, value] of Object.entries(options.storage?.load() ?? {})) {
      if (value !== undefined) this.intent.set(address, boundaryEntry(value));
    }
    const pending = new Map<string, IntentEntry>();
    for (const [key, value] of Object.entries(options.defaults ?? {})) {
      if (value !== undefined) pending.set(key, boundaryEntry(value));
    }

    this.resolution = resolve(this.resolver, this.intent, this.ext, this.cache, pending, this.defs as CodecRegistry | undefined);
    this.commitPending(pending);
    this.adoptDefaults();
    this.snapshot = diffSnapshot(null, this.resolution, this.errors).snapshot;
  }

  /**
   * The session remembers what it showed: a field that fell through to its
   * default gets that value recorded as EPHEMERAL intent at its active
   * address — so the displayed value survives sibling changes exactly like a
   * user choice (the flapping-default fix), while storage saves filter it out
   * and a fresh session re-derives today's default. Per-address recording is
   * what keeps per-bucket defaults (turbo vs base variants) independent.
   */
  private adoptDefaults(): void {
    for (const key of this.resolution.keys) {
      const record = this.resolution.records.get(key)!;
      if (record.isComputed || record.value === undefined) continue;
      if (this.intent.has(record.address)) continue;
      // No entry at the resolved address: the value is the default (or the
      // bare-key fallback, which reads the same either way) — after this,
      // every active field has a key/value in the map. Adoption is RAM-only
      // and dies with the store: a remounted or fresh store re-derives
      // today's defaults, which is the deliberate trade (see DEVLOG,
      // adopted defaults).
      this.intent.set(record.address, ephemeralEntry(record.value));
    }
  }

  /**
   * Files pending (key-addressed) values at the address each field resolved
   * with. A key with no active field keeps its stored intent:
   * it lands at the bare key, which scoped reads use as a fallback until an
   * explicit write supersedes it.
   */
  private commitPending(pending: ReadonlyMap<string, IntentEntry>): void {
    for (const [key, entry] of pending) {
      const address = this.resolution.records.get(key)?.address ?? key;
      // Committing the SAME entry object preserves the boundary parse cache.
      this.intent.set(address, entry);
      if (address !== key) this.intent.delete(key);
    }
  }

  getSnapshot(): Snapshot<State> {
    return this.snapshot;
  }

  getState(): State {
    return this.snapshot.state;
  }

  /** Null when the field isn't active in the current branch. */
  getField(key: string): FieldSnapshot | null {
    return this.snapshot.fields.get(key) ?? null;
  }

  /** What the resolver adjusted this pass — clamps, dropped choices. */
  getNotes(): readonly ResolutionNote[] {
    return this.resolution.notes;
  }

  /** Durable intent only — adopted defaults are session memory, never saved. */
  getIntent(): Record<string, unknown> {
    const plain: Record<string, unknown> = {};
    for (const [key, entry] of this.intent) {
      if (!entry.ephemeral) plain[key] = entry.value;
    }
    return plain;
  }

  subscribe(callback: Listener): () => void;
  subscribe(key: string, callback: Listener): () => void;
  subscribe(keyOrCallback: string | Listener, maybeCallback?: Listener): () => void {
    if (typeof keyOrCallback === 'function') {
      this.globalListeners.add(keyOrCallback);
      return () => this.globalListeners.delete(keyOrCallback);
    }
    const callback = maybeCallback!;
    let set = this.keyListeners.get(keyOrCallback);
    if (!set) {
      set = new Set();
      this.keyListeners.set(keyOrCallback, set);
    }
    set.add(callback);
    return () => {
      set!.delete(callback);
      if (set!.size === 0) this.keyListeners.delete(keyOrCallback);
    };
  }

  set(patch: Record<string, unknown>): void {
    const resolved = this.reconciler
      ? this.reconciler(patch, this.snapshot.state, this.ext)
      : patch;

    // A user write supersedes an external judgment against the field — the
    // same staleness rule the engine applies to its own surfaced errors.
    // BOTH key sets: the key the user wrote AND whatever the reconciler
    // rewrote it into — either way, the user acted on that field.
    for (const key of Object.keys(patch)) this.externalErrors.delete(key);
    for (const key of Object.keys(resolved)) this.externalErrors.delete(key);

    const pending = new Map<string, IntentEntry>();
    for (const [key, value] of Object.entries(resolved)) {
      if (value === undefined) {
        // Clear both the resolved bucket and the bare-key fallback.
        const address = this.resolution.records.get(key)?.address ?? key;
        this.intent.delete(address);
        this.intent.delete(key);
        continue;
      }
      const coerce = this.resolution.records.get(key)?.codec?.coerce;
      pending.set(key, trustedEntry(coerce ? coerce(value) : value));
    }

    const changed = this.recompute(pending);
    if (changed) this.options.storage?.save(this.getIntent());
  }

  setExt(ext: Ext): void {
    // A deep-equal ext is a semantic no-op — same resolution, same re-adopted
    // defaults — so skip the evict/recompute. This is also what lets a
    // stateless ext-sync helper (svelte syncExt) call unconditionally.
    if (deepEqual(this.ext, ext)) return;
    this.ext = ext;
    // Adopted defaults may be stale under the new ext (flags/limits hydrating
    // after first render) — evict them and re-adopt from the fresh resolve.
    for (const [address, entry] of [...this.intent]) {
      if (entry.ephemeral) this.intent.delete(address);
    }
    this.recompute();
  }

  /**
   * Clears intent. Excluded FIELD KEYS keep everything they've accumulated —
   * every scoped bucket included, so an excluded `steps` survives with its
   * per-scope memory intact.
   */
  reset(options: { exclude?: readonly string[] } = {}): void {
    const exclude = new Set(options.exclude ?? []);
    const keep = new Map<string, IntentEntry>();
    for (const [address, entry] of this.intent) {
      if (exclude.has(addressKey(address))) keep.set(address, entry);
    }
    this.intent = keep;
    this.errors.clear();
    this.externalErrors.clear();
    this.recompute();
    this.options.storage?.save(this.getIntent());
  }

  /**
   * Attach an EXTERNAL validity judgment to a field — the door for async
   * results (a server-side audit, a failed cost check) into the sync engine.
   * Participates in the snapshot's error and in validate()/output(); never
   * persisted. Cleared by a user write to the field, by the field leaving the
   * active branch, or explicitly via clearError().
   */
  setError(key: FieldKeys<Codecs>, error: { message: string; code?: string }): void {
    // A judgment against an INACTIVE field binds nothing — and must not lie
    // in wait for the branch to arrive. Silently dropping also absorbs the
    // race where an async result lands after a branch switch.
    if (!this.resolution.records.has(key)) return;
    this.externalErrors.set(key, {
      message: error.message,
      code: error.code ?? 'external',
      issues: [{ message: error.message, path: [] }],
    });
    this.publish(diffSnapshot(this.snapshot, this.resolution, this.judgedErrors()));
  }

  clearError(key: FieldKeys<Codecs>): void {
    if (!this.externalErrors.delete(key)) return;
    this.publish(diffSnapshot(this.snapshot, this.resolution, this.judgedErrors()));
  }

  /**
   * Engine errors overlaid with external judgments (external wins per key).
   * Judged at THIS choke point, an external error against an inactive key
   * blocks nothing — covering both a judgment set while the field was
   * already inactive and the race where a branch switch lands after an
   * async judgment fired (recompute's sweep is hygiene, not the guard).
   */
  private judgedErrors(): ReadonlyMap<string, FieldError> {
    if (this.externalErrors.size === 0) return this.errors;
    const merged = new Map(this.errors);
    for (const [key, error] of this.externalErrors) {
      if (this.resolution.records.has(key)) merged.set(key, error);
    }
    return merged;
  }

  /**
   * Runs output schemas, records errors on fields, and notifies. Mirrors
   * `set`'s shape: no argument judges the whole active graph; a key or key
   * list judges ONLY those fields (a wizard step's "Next"), surfacing and
   * clearing errors for them alone — other fields' surfaced errors are left
   * untouched. The scoped form returns no `data`: its success vouches only
   * for the named fields, and the full projection would over-promise.
   */
  validate(): ValidationResult<Data, State>;
  validate(keys: FieldKeys<Codecs> | readonly FieldKeys<Codecs>[]): ScopedValidationResult;
  validate(
    keys?: string | readonly string[]
  ): ValidationResult<Data, State> | ScopedValidationResult {
    const { errors, data } = validateResolution(this.resolution);

    if (keys === undefined) {
      this.errors = errors;
      const judged = this.judgedErrors();
      this.publish(diffSnapshot(this.snapshot, this.resolution, judged));
      if (judged.size > 0) {
        return { success: false, errors: Object.fromEntries(judged) };
      }
      return { success: true, data: data as Data, state: this.snapshot.state };
    }

    const scoped = new Map<string, FieldError>();
    for (const key of typeof keys === 'string' ? [keys] : keys) {
      if (!this.resolution.records.has(key)) continue; // inactive — nothing to judge
      const failure = errors.get(key);
      if (failure) {
        this.errors.set(key, failure);
        scoped.set(key, failure);
      } else {
        this.errors.delete(key);
      }
      const external = this.externalErrors.get(key);
      if (external) scoped.set(key, external);
    }
    this.publish(diffSnapshot(this.snapshot, this.resolution, this.judgedErrors()));

    if (scoped.size > 0) {
      return { success: false, errors: Object.fromEntries(scoped) };
    }
    return { success: true };
  }

  /**
   * The strict submission projection — typed as `State` on the same claim
   * `parse` makes: same keys, per-key output-validated (possibly stripped)
   * values. Never written back into state.
   */
  output(): Data {
    const { errors, data } = validateResolution(this.resolution);
    const external = [...this.externalErrors.keys()].filter((key) =>
      this.resolution.records.has(key)
    );
    if (errors.size > 0 || external.length > 0) {
      throw new Error(
        'output(): the form is invalid (' +
          [...new Set([...errors.keys(), ...external])].join(', ') +
          '). Use validate() for a checked result, or parsePartial() for best-effort data.'
      );
    }
    return data as Data;
  }

  /** Derived (computed) keys in the active branch. */
  getComputedKeys(): string[] {
    return this.resolution.keys.filter((key) => this.resolution.records.get(key)!.isComputed);
  }

  /**
   * Deletes intent entries whose ADDRESS matches —
   * `storageAdapter.removeKey` sweeps (clearStorageForOutput). The predicate
   * sees full addresses (`steps@groupA/2`); match on `addressKey(address)` to
   * clear every bucket of one field.
   */
  prune(predicate: (address: string) => boolean): void {
    for (const address of [...this.intent.keys()]) {
      if (predicate(address)) this.intent.delete(address);
    }
    this.recompute();
    this.options.storage?.save(this.getIntent());
  }

  /** Keys whose codec is being rebuilt on every pass — hoist these. */
  getCodecChurn(): string[] {
    const churned: string[] = [];
    for (const [key, streak] of this.codecChurnStreak) {
      if (streak >= CHURN_STREAK_LIMIT) churned.push(key);
    }
    return churned;
  }

  private trackCodecChurn(): void {
    for (const key of this.resolution.keys) {
      const codec = this.resolution.records.get(key)?.codec;
      if (!codec) continue;

      // Schema identity, not codec-object identity: a def FACTORY returns a
      // fresh object every pass by design, and that costs nothing — the
      // expensive part is rebuilding the schemas inside it. `{ ...HOISTED }`
      // is clean; an inline `z.object(...)` per pass is the churn. BOTH
      // schemas are checked — a cached input must not mask a per-pass
      // rebuilt output (the requiredness-by-output-spread pattern).
      const inputIdentity = codec.input;
      const outputIdentity = codec.output;
      const previous = this.codecIdentity.get(key);
      this.codecIdentity.set(key, { input: inputIdentity, output: outputIdentity });

      if (
        previous === undefined ||
        (previous.input === inputIdentity && previous.output === outputIdentity)
      ) {
        this.codecChurnStreak.set(key, 0);
        continue;
      }

      const streak = (this.codecChurnStreak.get(key) ?? 0) + 1;
      this.codecChurnStreak.set(key, streak);

      if (
        streak >= CHURN_STREAK_LIMIT &&
        this.options.warnOnCodecChurn !== false &&
        !this.reportedChurn.has(key)
      ) {
        this.reportedChurn.add(key);
        console.warn(
          `[form-graph] Field "${key}" rebuilds its schemas on every pass. Hoist the ` +
            `input/output schemas (or the whole def) to module scope — per-pass schema ` +
            `construction is the dominant cost on the keystroke path.`
        );
      }
    }
  }

  private recompute(pending?: ReadonlyMap<string, IntentEntry>): boolean {
    this.resolution = resolve(this.resolver, this.intent, this.ext, this.cache, pending, this.defs as CodecRegistry | undefined);
    if (pending) this.commitPending(pending);
    this.adoptDefaults();
    this.trackCodecChurn();

    // Drop stale errors for fields whose value moved; validate() refreshes the
    // rest. A field whose REFINEMENT lifted (deps changed, value didn't) is
    // re-judged here — bounded to fields currently carrying an error.
    for (const key of [...this.errors.keys()]) {
      const record = this.resolution.records.get(key);
      if (!record || record.value !== this.snapshot.fields.get(key)?.value) {
        this.errors.delete(key);
        continue;
      }
      if (record.refined && runSchema(record.refined, record.value).success) {
        this.errors.delete(key);
      }
    }
    // An external judgment against a field the branch deactivated can block
    // nothing — drop it with the branch, like every other per-branch state.
    for (const key of [...this.externalErrors.keys()]) {
      if (!this.resolution.records.has(key)) this.externalErrors.delete(key);
    }

    const result = diffSnapshot(this.snapshot, this.resolution, this.judgedErrors());
    this.publish(result);
    return result.changed.size > 0;
  }

  /**
   * Re-entrancy depth: subscribers calling set() from a notification. Bounded
   * cascades are legal (equal values terminate them); a runaway one is the ONE
   * cycle shape this design cannot rule out structurally, so it is detected —
   * the engine's only runtime cycle check, vs an iteration-cap breaker
   * guarding its whole evaluation loop.
   */
  private notifyDepth = 0;

  private publish({ snapshot, changed }: { snapshot: Snapshot<State>; changed: Set<string> }): void {
    if (changed.size === 0) return;
    this.snapshot = snapshot;

    if (this.notifyDepth >= 25) {
      throw new Error(
        'form-graph: set() cascade exceeded depth 25 — a subscriber is writing a value that ' +
          'keeps changing on every notification. Break the cycle in the subscriber, or move ' +
          'the coupling into a rule (rules run once per set and cannot loop).'
      );
    }

    this.notifyDepth++;
    try {
      for (const key of changed) {
        const listeners = this.keyListeners.get(key);
        if (listeners) for (const listener of listeners) listener();
      }
      for (const listener of this.globalListeners) listener();
    } finally {
      this.notifyDepth--;
    }
  }
}
