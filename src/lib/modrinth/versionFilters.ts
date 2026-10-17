import {
  LOADERS,
  loaderLabels,
  normalizeLoader,
  type ModrinthVersion,
} from "./mapping";

export type VersionFilter = {
  /** Exact Modrinth game version, or "" for any. */
  gameVersion: string;
  /** Exact Modrinth loader ID such as "neoforge", or "" for any. */
  loader: string;
  showAll: boolean;
};

const RELEASE = /^(\d+(?:\.\d+)*)(?:[-\s]?(rc|pre)[-\s]?(\d+))?$/i;
const STAGE: Record<string, number> = { "": 2, rc: 1, pre: 0 };

/**
 * Orders Minecraft versions newest first. Releases compare by numeric parts (so 1.21.10 is newer
 * than 1.21.9), and a release beats its release candidates, which beat its pre-releases.
 * Snapshots and other names sort after all numbered versions.
 */
export function compareMinecraftVersions(a: string, b: string): number {
  const left = a.match(RELEASE);
  const right = b.match(RELEASE);
  if (!left || !right) {
    if (left) return -1;
    if (right) return 1;
    return b.localeCompare(a, "en", { numeric: true });
  }
  const leftParts = (left[1] ?? "").split(".").map(Number);
  const rightParts = (right[1] ?? "").split(".").map(Number);
  for (
    let index = 0;
    index < Math.max(leftParts.length, rightParts.length);
    index += 1
  ) {
    const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
    if (difference) return difference;
  }
  const stage =
    (STAGE[(right[2] ?? "").toLowerCase()] ?? 0) -
    (STAGE[(left[2] ?? "").toLowerCase()] ?? 0);
  if (stage) return stage;
  return Number(right[3] ?? 0) - Number(left[3] ?? 0);
}

export function sortMinecraftVersions(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareMinecraftVersions);
}

export function loaderLabel(value: string): string {
  const known = normalizeLoader(value);
  return known
    ? loaderLabels[known]
    : value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Dropdown options from the fetched versions' metadata. The pack's own values are always included
 * so the initial selection exists even when no version matches it.
 */
export function versionFilterOptions(
  versions: ModrinthVersion[],
  pack: { gameVersion?: string; loader?: string },
): { gameVersions: string[]; loaders: string[] } {
  const gameVersions = sortMinecraftVersions([
    ...versions.flatMap((version) => version.gameVersions),
    ...(pack.gameVersion ? [pack.gameVersion] : []),
  ]);
  const found = new Set([
    ...versions.flatMap((version) => version.loaders),
    ...(pack.loader ? [pack.loader] : []),
  ]);
  const known = LOADERS.filter((loader) => found.has(loader));
  const others = [...found]
    .filter((loader) => !(LOADERS as readonly string[]).includes(loader))
    .sort();
  return { gameVersions, loaders: [...known, ...others] };
}

/** Exact match on both filters, using the version's own metadata. */
export function matchesFilter(
  version: ModrinthVersion,
  filter: VersionFilter,
): boolean {
  if (filter.showAll) return true;
  return (
    (!filter.gameVersion ||
      version.gameVersions.includes(filter.gameVersion)) &&
    (!filter.loader || version.loaders.includes(filter.loader))
  );
}

/** Matching versions, newest publish date first. */
export function filterVersions(
  versions: ModrinthVersion[],
  filter: VersionFilter,
): ModrinthVersion[] {
  return versions
    .filter((version) => matchesFilter(version, filter))
    .sort(
      (a, b) =>
        (Date.parse(b.datePublished) || 0) - (Date.parse(a.datePublished) || 0),
    );
}

/** Pack settings a version is not listed for; empty when it matches both, or a setting is unset. */
export function packMismatches(
  version: ModrinthVersion,
  pack: { gameVersion?: string; loader?: string },
): string[] {
  const issues: string[] = [];
  if (pack.gameVersion && !version.gameVersions.includes(pack.gameVersion))
    issues.push(`Minecraft ${pack.gameVersion}`);
  if (pack.loader && !version.loaders.includes(pack.loader))
    issues.push(loaderLabel(pack.loader));
  return issues;
}
