/**
 * Displacement map for the liquid glass edge refraction. Red holds the horizontal offset and
 * green the vertical one; 128 means "no offset". The centre stays neutral and the offset grows
 * towards each edge, so only the rim bends what is behind it.
 */
export function edgeDisplacementPixels(
  size: number,
  /** Width of the bending rim as a share of the side, 0–0.5. */
  edge = 0.18,
): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const rim = Math.max(1e-6, Math.min(0.5, edge));
  // 0 inside the rim's inner line, rising smoothly to 1 at the edge.
  const ramp = (distance: number) => {
    const t = Math.min(1, Math.max(0, 1 - distance / rim));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      // Pull towards the centre near each edge, like light bending through a thick rim.
      const dx = ramp(u) - ramp(1 - u);
      const dy = ramp(v) - ramp(1 - v);
      const index = (y * size + x) * 4;
      pixels[index] = Math.round(128 + dx * 127);
      pixels[index + 1] = Math.round(128 + dy * 127);
      pixels[index + 2] = 128;
      pixels[index + 3] = 255;
    }
  return pixels;
}

/**
 * Only Chromium renders SVG filters inside `backdrop-filter`; Safari and Firefox accept the
 * syntax but draw nothing, so `CSS.supports` cannot tell. User-Agent Client Hints exist only in
 * Chromium and name it among the brands.
 */
type BrandedNavigator = {
  userAgentData?: { brands?: { brand: string }[] };
};

export function supportsBackdropRefraction(nav: object | undefined): boolean {
  // userAgentData is not in TypeScript's DOM types yet.
  const brands = (nav as BrandedNavigator | undefined)?.userAgentData?.brands;
  return Boolean(brands?.some((entry) => entry.brand === "Chromium"));
}
