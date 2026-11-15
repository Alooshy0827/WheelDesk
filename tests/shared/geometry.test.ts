import { describe, expect, it } from 'vitest';
import { WHEEL, pickSlice } from '../../src/shared/geometry';

const at = (deg: number, r = 150) => {
  // deg measured clockwise from straight up (N), screen y points down
  const rad = ((deg - 90) * Math.PI) / 180;
  return pickSlice(r * Math.cos(rad), r * Math.sin(rad));
};

describe('pickSlice', () => {
  it.each(Array.from({ length: 11 }, (_, i) => i + 2))('divides all directions into %i equal spokes', count => {
    const pick = (deg: number) => pickSlice(200 * Math.sin(deg * Math.PI / 180), -200 * Math.cos(deg * Math.PI / 180), 86, count);
    const angle = 360 / count;
    for (let i = 0; i < count; i++) {
      expect(pick(i * angle)).toBe(i);
      expect(pick((i + 0.5) * angle - 0.001)).toBe(i);
      expect(pick((i + 0.5) * angle + 0.001)).toBe((i + 1) % count);
    }
    expect(pickSlice(0, 0, 86, count)).toBe(-1);
    expect(pick(-0.01)).toBe(0);
  });
  it('maps the 8 compass directions to slices 0..7 clockwise from N', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map((d) => at(d))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('returns -1 inside the dead zone and a slice at its edge', () => {
    expect(pickSlice(0, -(WHEEL.innerR - 1))).toBe(-1);
    expect(pickSlice(0, 0)).toBe(-1);
    expect(pickSlice(0, -WHEEL.innerR)).toBe(0);
  });

  it('splits slices exactly at ±22.5° and wraps around N', () => {
    expect(at(22.4)).toBe(0);
    expect(at(22.6)).toBe(1);
    expect(at(-1)).toBe(0);
    expect(at(-22.6)).toBe(7);
    expect(at(359.9)).toBe(0);
  });

  it('honours a custom dead zone', () => {
    expect(pickSlice(0, -50, 40)).toBe(0);
    expect(pickSlice(0, -30, 40)).toBe(-1);
  });
});
