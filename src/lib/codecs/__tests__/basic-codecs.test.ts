import { describe, expect, it } from 'vitest';
import { defineForm } from '../../core/form.js';
import { type Fields } from '../../core/resolve.js';
import { aspectRatioCodec } from '../../generation/codecs/aspect-ratio.js';
import { enumCodec, numberCodec } from '../basic.js';
import { seedCodec } from '../../generation/codecs/seed.js';

/** Ports of common.ts's simple node builders — same leniency, same strictness. */

const AR = aspectRatioCodec({
  options: [
    { label: 'Square', value: '1:1', width: 1024, height: 1024 },
    { label: 'Landscape', value: '16:9', width: 1280, height: 720 },
    { label: 'Portrait', value: '9:16', width: 720, height: 1280 },
  ],
});
const STEPS = numberCodec({ min: 1, max: 50, step: 5, default: 25 });
const SEED = seedCodec();
const PRIORITY = enumCodec({
  options: [
    { label: 'Low', value: 1 },
    { label: 'High', value: 2 },
  ],
  default: 1,
});

const form = defineForm<void>()({
  resolve: (f: Fields) => ({
    aspectRatio: f.field('aspectRatio', AR),
    steps: f.field('steps', STEPS),
    seed: f.field('seed', SEED),
    priority: f.field('priority', PRIORITY),
  }),
});

const parse = (raw: Record<string, unknown>) => {
  const result = form.parse(raw, undefined);
  if (!result.success) throw new Error(JSON.stringify(result.errors));
  return result.data;
};

describe('aspectRatioCodec (aspectRatioNode port)', () => {
  it('resolves an exact match to the full option object', () => {
    expect(parse({ aspectRatio: '16:9' }).aspectRatio).toMatchObject({
      value: '16:9',
      width: 1280,
      height: 720,
    });
  });

  it('coerces unknown dimensions to the closest available ratio', () => {
    // 1920x1088 is nearly 16:9
    expect(parse({ aspectRatio: { value: 'custom', width: 1920, height: 1088 } }).aspectRatio)
      .toMatchObject({ value: '16:9' });
  });

  it('coerces an unknown "W:H" string to the closest ratio', () => {
    expect(parse({ aspectRatio: '8:16' }).aspectRatio).toMatchObject({ value: '9:16' });
  });

  it('falls back to the default for garbage', () => {
    expect(parse({ aspectRatio: 'wide' }).aspectRatio).toMatchObject({ value: '1:1' });
  });

  it('coerces a bare ratio string on trusted set()', () => {
    const s = form.createStore({ ext: undefined });
    s.set({ aspectRatio: '9:16' as never });
    expect(s.getState().aspectRatio).toMatchObject({ value: '9:16', width: 720 });
  });
});

describe('numberCodec (sliderNode port)', () => {
  it('snaps boundary values to the step grid', () => {
    expect(parse({ steps: '13' }).steps).toBe(11); // snapped to min+step grid (1, 6, 11, ...)
  });

  it('snaps trusted writes via coerce', () => {
    const s = form.createStore({ ext: undefined });
    s.set({ steps: 999 });
    expect(s.getState().steps).toBe(50);
  });
});

describe('seedCodec (seedNode port)', () => {
  it('normalises null and numeric strings', () => {
    expect(parse({ seed: null }).seed).toBeUndefined();
    expect(parse({ seed: '1234' }).seed).toBe(1234);
  });
});

describe('enumCodec (enumNode port)', () => {
  it('coerces SegmentedControl string values for numeric enums', () => {
    const s = form.createStore({ ext: undefined });
    s.set({ priority: '2' as never });
    expect(s.getState().priority).toBe(2);
  });

  it('drops invalid boundary values to the default', () => {
    expect(parse({ priority: 7 }).priority).toBe(1);
  });
});
