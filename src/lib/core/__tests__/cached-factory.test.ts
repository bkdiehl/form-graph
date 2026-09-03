import { describe, expect, it, vi } from 'vitest';
import { cachedFactory } from '../def-helpers.js';

describe('cachedFactory', () => {
  it('builds once per distinct config, works with arrow functions', () => {
    const build = vi.fn((cfg: { min: number; max: number }) => ({ ...cfg, built: true }));
    const factory = cachedFactory(build);

    const a1 = factory({ min: 1, max: 10 });
    const a2 = factory({ min: 1, max: 10 });
    const b = factory({ min: 2, max: 10 });

    expect(a1).toBe(a2);
    expect(b).not.toBe(a1);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('keyOf narrows the cache key below the full config', () => {
    const factory = cachedFactory(
      (cfg: { min: number; label: string }) => ({ schemas: cfg.min }),
      (cfg) => String(cfg.min)
    );
    // same min, different label: label is NOT part of the key
    expect(factory({ min: 1, label: 'a' })).toBe(factory({ min: 1, label: 'b' }));
  });
});
