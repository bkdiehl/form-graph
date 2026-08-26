import { describe, expect, it } from 'vitest';
import { miniForm, type MiniState } from '../__fixtures__/mini-generation.js';
import type { InferFieldValue, InferState } from '../core/index.js';

/**
 * Type-level assertions. These carry no runtime weight — the value is that
 * `pnpm typecheck` fails if any of them stops holding.
 *
 * The claim under test: a resolver's return type IS a discriminated union, so
 * everything v1 builds with BuildDiscriminatedUnion / groupedDiscriminator /
 * MergePreferRight comes from control-flow inference for free.
 */

type Assert<T extends true> = T;
type Equals<A, B> = (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2
  ? true
  : false;
type Extends<A, B> = A extends B ? true : false;

// --- the form's state type is the resolver's return type -------------------
type _StateIsInferred = Assert<Equals<InferState<typeof miniForm>, MiniState>>;

// --- narrowing by a nested discriminant, exactly as the server handlers do --
// (mirrors: type LTXCtx = Extract<GenerationGraphTypes['Ctx'], { ecosystem: 'LTXV2' }>)
type FluxStandard = Extract<MiniState, { ecosystem: 'Flux'; fluxMode: 'standard' }>;
type FluxDraft = Extract<MiniState, { ecosystem: 'Flux'; fluxMode: 'draft' }>;
type Upscale = Extract<MiniState, { workflow: 'image:upscale' }>;

type _StandardHasSteps = Assert<Extends<FluxStandard['steps'], number>>;
type _StandardHasResources = Assert<Extends<FluxStandard['resources'], string[]>>;

// The draft branch genuinely lacks the standard-only fields — not optional, absent.
type _DraftHasNoSteps = Assert<Equals<'steps' extends keyof FluxDraft ? true : false, false>>;
type _DraftHasNoResources = Assert<
  Equals<'resources' extends keyof FluxDraft ? true : false, false>
>;

// The upscale branch is disjoint from the ecosystem branches.
type _UpscaleHasUpscaler = Assert<Extends<Upscale['upscaler'], string>>;
type _UpscaleHasNoEcosystem = Assert<
  Equals<'ecosystem' extends keyof Upscale ? true : false, false>
>;

// --- flat key lookup across branches ---------------------------------------
type _StepsAcrossBranches = Assert<Equals<InferFieldValue<MiniState, 'steps'>, number>>;
type _WorkflowIsTheFullUnion = Assert<
  Equals<
    InferFieldValue<MiniState, 'workflow'>,
    'image:create' | 'image:draft' | 'image:upscale' | 'video:create'
  >
>;

describe('type-level contracts', () => {
  it('narrows at runtime the same way the types promise', () => {
    const result = miniForm.parse(
      { prompt: 'a cat', ecosystem: 'Flux', model: 'flux-draft' },
      { limits: { maxResources: 3 }, tier: 'free' }
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    const state = result.state;
    if ('ecosystem' in state && state.ecosystem === 'Flux' && state.fluxMode === 'draft') {
      // `state` is FluxDraft here; the compiler rejects `state.steps`.
      expect(state.aspectRatio).toBe('1:1');
      expect('steps' in state).toBe(false);
    } else {
      throw new Error('expected the flux draft branch');
    }
  });

  it('discriminates the upscale branch on workflow', () => {
    const result = miniForm.parse(
      { prompt: 'a cat', workflow: 'image:upscale' },
      { limits: { maxResources: 3 }, tier: 'free' }
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    const state = result.state;
    if (state.workflow === 'image:upscale') {
      expect(state.upscaler).toBe('esrgan');
    } else {
      throw new Error('expected the upscale branch');
    }
  });
});
