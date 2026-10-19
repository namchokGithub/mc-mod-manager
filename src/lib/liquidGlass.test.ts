import { describe, expect, it } from "vitest";
import {
  edgeDisplacementPixels,
  lensDisplacementPixels,
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

describe("lens displacement map", () => {
  // A 120 × 40 pill: corner radius 20, bevel 12.
  const width = 120;
  const height = 40;
  const map = lensDisplacementPixels(width, height, 20, 12);
  const at = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    return [map[index]!, map[index + 1]!];
  };

  it("leaves the middle clear", () => {
    expect(at(60, 20)).toEqual([128, 128]);
  });

  it("pulls inward along the straight edges", () => {
    expect(at(60, 0)[1]).toBeGreaterThan(200);
    expect(at(60, 39)[1]).toBeLessThan(56);
    expect(at(60, 0)[0]).toBe(128);
  });

  it("follows the rounded ends diagonally", () => {
    const [x, y] = at(8, 10);
    expect(x).toBeGreaterThan(128);
    expect(y).toBeGreaterThan(128);
  });

  it("leaves the area outside the corner untouched", () => {
    expect(at(0, 0)).toEqual([128, 128]);
  });
});
