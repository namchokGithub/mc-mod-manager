export const COUNT_UP_DURATION_MS = 1000;

export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

/** Value shown `elapsed` ms into a count-up from 0 to `target`. */
export function countUpValue(
  target: number,
  elapsed: number,
  duration = COUNT_UP_DURATION_MS,
): number {
  if (target === 0 || duration <= 0) return target;
  return Math.round(target * easeOutCubic(elapsed / duration));
}

/** Two-digit minimum ("00", "07", "42"), with no truncation above 99. */
export function formatStat(value: number): string {
  return value.toString().padStart(2, "0");
}
