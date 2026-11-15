/** Wheel geometry in CSS pixels (matches prototype/wheel-demo.html). */
export const WHEEL = { size: 600, innerR: 86, outerR: 188, extR: 288, iconR: 137, iconSize: 48 } as const;
export const WHEEL_SLOT_LIMITS = { min: 2, max: 12, default: 8 } as const;
export function normalizeSlotCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(WHEEL_SLOT_LIMITS.min, Math.min(WHEEL_SLOT_LIMITS.max, Math.round(value)))
    : WHEEL_SLOT_LIMITS.default;
}

/**
 * Slice under an offset from the wheel centre. Screen coordinates (y down).
 * Returns -1 inside the dead zone, else 0..count-1, clockwise from N.
 * Defaults to the original eight compass directions.
 */
export function pickSlice(dx: number, dy: number, deadZone: number = WHEEL.innerR, count: number = WHEEL_SLOT_LIMITS.default): number {
  if (!Number.isInteger(count) || count < 2) return -1;
  if (Math.hypot(dx, dy) < deadZone) return -1;
  const angle = 360 / count;
  const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + angle / 2 + 360) % 360;
  return Math.floor(deg / angle) % count;
}
