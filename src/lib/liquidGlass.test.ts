import { describe, expect, it } from "vitest";
import {
  edgeDisplacementPixels,
  supportsBackdropRefraction,
} from "./liquidGlass";

describe("edge displacement map", () => {
  const size = 64;
  const map = edgeDisplacementPixels(size);
  const at = (x: number, y: number) => {
    const index = (y * size + x) * 4;
    return [map[index], map[index + 1], map[index + 2], map[index + 3]];
  };

  it("leaves the centre unbent and fully opaque", () => {
    expect(at(32, 32)).toEqual([128, 128, 128, 255]);
  });

  it("bends inward near each edge, more at the very edge", () => {
    expect(at(0, 32)[0]).toBeGreaterThan(220);
    expect(at(63, 32)[0]).toBeLessThan(36);
    expect(at(32, 0)[1]).toBeGreaterThan(220);
    expect(at(32, 63)[1]).toBeLessThan(36);
    expect(at(0, 32)[0]!).toBeGreaterThan(at(5, 32)[0]!);
  });
});

describe("refraction support", () => {
  it("is on only where Client Hints name Chromium", () => {
    expect(
      supportsBackdropRefraction({
        userAgentData: { brands: [{ brand: "Chromium" }] },
      }),
    ).toBe(true);
    expect(supportsBackdropRefraction({})).toBe(false);
    expect(supportsBackdropRefraction(undefined)).toBe(false);
  });
});
