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

/**
 * Displacement map for a clear "lens" with the element's own shape: a rounded rectangle of
 * `width` × `height` and corner `radius` (all in map pixels). Inside a rim `bezel` wide the
 * backdrop is pulled towards the centre along the edge's normal, strongest at the edge, which
 * reads as light bending through a thick rounded edge. The middle stays clear (128 = no offset).
 */
export function lensDisplacementPixels(
  width: number,
  height: number,
  radius: number,
  bezel: number,
): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const halfW = width / 2;
  const halfH = height / 2;
  const r = Math.max(0, Math.min(radius, halfW, halfH));
  const rim = Math.max(1, bezel);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5 - halfW;
      const py = y + 0.5 - halfH;
      // Distance past the straight part of each side; both positive means a corner.
      const qx = Math.abs(px) - (halfW - r);
      const qy = Math.abs(py) - (halfH - r);
      let nx = 0;
      let ny = 0;
      let inside: number;
      if (qx > 0 && qy > 0) {
        const length = Math.hypot(qx, qy) || 1;
        nx = (qx / length) * Math.sign(px);
        ny = (qy / length) * Math.sign(py);
        inside = r - Math.hypot(qx, qy);
      } else if (halfW - Math.abs(px) < halfH - Math.abs(py)) {
        nx = Math.sign(px);
        inside = halfW - Math.abs(px);
      } else {
        ny = Math.sign(py);
        inside = halfH - Math.abs(py);
      }
      const t = Math.min(1, Math.max(0, 1 - inside / rim));
      // Eased so the bend builds up towards the very edge, like a curved bevel.
      const strength = inside < 0 ? 0 : t * t;
      const index = (y * width + x) * 4;
      pixels[index] = Math.round(128 - nx * strength * 127);
      pixels[index + 1] = Math.round(128 - ny * strength * 127);
      pixels[index + 2] = 128;
      pixels[index + 3] = 255;
    }
  return pixels;
}
