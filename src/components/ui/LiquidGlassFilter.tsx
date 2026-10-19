import { useEffect, useState } from "react";
import {
  edgeDisplacementPixels,
  supportsBackdropRefraction,
} from "../../lib/liquidGlass";

const MAP_SIZE = 128;

/** The map as a data URL, or null where refraction stays off. Client-only (no SSR here). */
function buildMap(): string | null {
  const reduced = window.matchMedia(
    "(prefers-reduced-transparency: reduce)",
  ).matches;
  if (reduced || !supportsBackdropRefraction(navigator)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = MAP_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.putImageData(
    new ImageData(edgeDisplacementPixels(MAP_SIZE), MAP_SIZE, MAP_SIZE),
    0,
    0,
  );
  return canvas.toDataURL();
}

/**
 * The SVG filter behind `.liquid-refraction` surfaces: edge refraction with a slight red/blue
 * split, like light bending through thick glass. Rendered once per page. It switches itself on
 * (the `liquid-refraction` class on <html>) only in Chromium and when the user has not asked
 * for reduced transparency; everywhere else the CSS keeps the plain blur.
 */
export function LiquidGlassFilter() {
  const [map] = useState(buildMap);

  // The CSS opts surfaces in only while this filter exists.
  useEffect(() => {
    if (!map) return;
    const root = document.documentElement;
    root.classList.add("liquid-refraction");
    return () => root.classList.remove("liquid-refraction");
  }, [map]);

  if (!map) return null;
  return (
    <svg
      className="liquid-glass-defs"
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
    >
      <filter
        id="liquid-glass"
        x="0"
        y="0"
        width="100%"
        height="100%"
        colorInterpolationFilters="sRGB"
      >
        <feImage
          href={map}
          x="0"
          y="0"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          result="map"
        />
        {/* Each colour bends a little differently, which gives the rim its faint rainbow. */}
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale="34"
          xChannelSelector="R"
          yChannelSelector="G"
          result="red"
        />
        <feColorMatrix
          in="red"
          type="matrix"
          values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
          result="r"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale="30"
          xChannelSelector="R"
          yChannelSelector="G"
          result="green"
        />
        <feColorMatrix
          in="green"
          type="matrix"
          values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
          result="g"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="map"
          scale="26"
          xChannelSelector="R"
          yChannelSelector="G"
          result="blue"
        />
        <feColorMatrix
          in="blue"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
          result="b"
        />
        <feComposite
          in="r"
          in2="g"
          operator="arithmetic"
          k2="1"
          k3="1"
          result="rg"
        />
        <feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1" />
      </filter>
    </svg>
  );
}
