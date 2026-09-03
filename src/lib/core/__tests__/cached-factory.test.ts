import { describe, expect, it, vi } from 'vitest';
import { defFamily } from '../codec.js';
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

  it('defFamily takes JSON-able CONFIG OBJECTS, not just primitives — one mechanism', () => {
    const build = vi.fn((cfg: { min: number; presets: readonly { value: number }[] }) => ({
      built: cfg.min,
    }));
    const family = defFamily(build);
    const a = family({ min: 1, presets: [{ value: 5 }] });
    expect(family({ min: 1, presets: [{ value: 5 }] })).toBe(a);
    expect(build).toHaveBeenCalledTimes(1);
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
