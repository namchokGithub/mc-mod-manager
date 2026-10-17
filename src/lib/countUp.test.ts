import { describe, expect, it } from "vitest";
import { countUpValue, easeOutCubic, formatStat } from "./countUp";

describe("easeOutCubic", () => {
  it("starts at 0, ends at 1, and front-loads progress", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
  });

  it("clamps progress outside 0 to 1", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});

describe("countUpValue", () => {
  it("counts from 0 to the target over the duration", () => {
    expect(countUpValue(40, 0)).toBe(0);
    expect(countUpValue(40, 500)).toBe(35);
    expect(countUpValue(40, 1000)).toBe(40);
    expect(countUpValue(40, 5000)).toBe(40);
  });

  it("shows zero immediately", () => {
    expect(countUpValue(0, 0)).toBe(0);
    expect(countUpValue(0, 500)).toBe(0);
  });

  it("never overshoots or goes backwards", () => {
    let previous = 0;
    for (let time = 0; time <= 1000; time += 50) {
      const value = countUpValue(250, time);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(250);
      previous = value;
    }
  });
});

describe("formatStat", () => {
  it("keeps the two-digit minimum without truncating larger values", () => {
    expect(formatStat(0)).toBe("00");
    expect(formatStat(7)).toBe("07");
    expect(formatStat(42)).toBe("42");
    expect(formatStat(128)).toBe("128");
  });
});
