import {
  lensDisplacementPixels,
  supportsBackdropRefraction,
} from "./liquidGlass";

const SVG = "http://www.w3.org/2000/svg";
/** Longest side of a generated map; larger elements reuse a scaled-up map. */
const MAX_MAP = 240;

let host: SVGSVGElement | null = null;
let count = 0;

function defs(): SVGSVGElement {
  if (host?.isConnected) return host;
  host = document.createElementNS(SVG, "svg");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("width", "0");
  host.setAttribute("height", "0");
  host.setAttribute("class", "liquid-glass-defs");
  document.body.append(host);
  return host;
}

function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string>,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes))
    element.setAttribute(name, value);
  return element;
}

/** Red, green, and blue bend by slightly different amounts for the rainbow edge. */
const CHANNELS = [
  { scale: 1, matrix: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" },
  { scale: 0.92, matrix: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" },
  { scale: 0.84, matrix: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" },
];

function createFilter(id: string) {
  const filter = node("filter", {
    id,
    x: "0",
    y: "0",
    width: "100%",
    height: "100%",
    "color-interpolation-filters": "sRGB",
  });
  const image = node("feImage", {
    x: "0",
    y: "0",
    width: "100%",
    height: "100%",
    preserveAspectRatio: "none",
    result: "map",
  });
  filter.append(image);
  const displacements = CHANNELS.map((channel, index) => {
    const displacement = node("feDisplacementMap", {
      in: "SourceGraphic",
      in2: "map",
      xChannelSelector: "R",
      yChannelSelector: "G",
      result: `d${index}`,
    });
    filter.append(
      displacement,
      node("feColorMatrix", {
        in: `d${index}`,
        type: "matrix",
        values: channel.matrix,
        result: `c${index}`,
      }),
    );
    return { displacement, scale: channel.scale };
  });
  filter.append(
    node("feComposite", {
      in: "c0",
      in2: "c1",
      operator: "arithmetic",
      k2: "1",
      k3: "1",
      result: "c01",
    }),
    node("feComposite", {
      in: "c01",
      in2: "c2",
      operator: "arithmetic",
      k2: "1",
      k3: "1",
    }),
  );
  return { filter, image, displacements };
}

function lensSupported(): boolean {
  return (
    supportsBackdropRefraction(navigator) &&
    !window.matchMedia("(prefers-reduced-transparency: reduce)").matches
  );
}

/**
 * Ref callback (React 19 runs the returned cleanup) that turns an element into a clear liquid
 * glass lens in Chromium: its own displacement map follows its size and corner radius and is
 * rebuilt when it resizes. Elsewhere it does nothing and the element keeps its frosted style.
 */
export function liquidLens(element: HTMLElement | null) {
  if (!element || !lensSupported()) return;
  const id = `liquid-lens-${(count += 1)}`;
  const { filter, image, displacements } = createFilter(id);
  defs().append(filter);
  const canvas = document.createElement("canvas");
  let frame = 0;

  const update = () => {
    frame = 0;
    const { width, height } = element.getBoundingClientRect();
    if (width < 4 || height < 4) return;
    const factor = Math.min(1, MAX_MAP / Math.max(width, height));
    const mapW = Math.max(2, Math.round(width * factor));
    const mapH = Math.max(2, Math.round(height * factor));
    const radius = Math.min(
      parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0,
      Math.min(width, height) / 2,
    );
    // A thick bevel on small pills, a thinner one on wide panels.
    const bezel = Math.min(Math.min(width, height) * 0.42, 22);
    canvas.width = mapW;
    canvas.height = mapH;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.putImageData(
      new ImageData(
        lensDisplacementPixels(mapW, mapH, radius * factor, bezel * factor),
        mapW,
        mapH,
      ),
      0,
      0,
    );
    image.setAttribute("href", canvas.toDataURL());
    // feDisplacementMap moves pixels by scale × (value − 0.5): the edge bends about one bevel.
    for (const { displacement, scale } of displacements)
      displacement.setAttribute(
        "scale",
        String(Math.round(bezel * 1.6 * scale)),
      );
    element.style.setProperty("--liquid-lens", `url(#${id})`);
    element.classList.add("lens-active");
  };

  const observer = new ResizeObserver(() => {
    if (!frame) frame = requestAnimationFrame(update);
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    filter.remove();
    element.classList.remove("lens-active");
    element.style.removeProperty("--liquid-lens");
  };
}
