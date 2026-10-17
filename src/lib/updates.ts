import type { ModrinthVersion } from "./modrinth/mapping";
import type { Mod } from "./schema";

export type UpdateStatus = "up-to-date" | "update-available" | "unknown";

export type VersionSummary = {
  id: string;
  versionNumber: string;
  versionType: string;
  datePublished: string;
};

export type UpdateResult = {
  status: UpdateStatus;
  reason: string;
  /** The version ID that was checked, so a result goes stale once the mod changes version. */
  checkedVersionId?: string;
  current?: VersionSummary;
  latest?: VersionSummary;
};

export const updateLabels: Record<UpdateStatus, string> = {
  "up-to-date": "Up to date",
  "update-available": "Update available",
  unknown: "Unknown",
};

const STABILITY: Record<string, number> = { release: 0, beta: 1, alpha: 2 };

export function summarize(version: ModrinthVersion): VersionSummary {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    versionType: version.versionType,
    datePublished: version.datePublished,
  };
}

const time = (value: string | undefined) => {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Picks the newest version by publish date within the allowed release channels. A release is
 * only compared with releases; a beta also accepts releases, an alpha accepts everything.
 * Returns `ambiguous` when dates are missing or several versions tie for newest.
 */
export function pickLatest(
  versions: ModrinthVersion[],
  currentType = "release",
): { latest?: ModrinthVersion; ambiguous: boolean; noneAllowed: boolean } {
  const maxRank = STABILITY[currentType] ?? 0;
  const allowed = versions.filter(
    (version) => (STABILITY[version.versionType] ?? 3) <= maxRank,
  );
  if (!allowed.length) return { ambiguous: false, noneAllowed: true };
  const dated = allowed.filter(
    (version) => time(version.datePublished) !== null,
  );
  if (!dated.length) return { ambiguous: true, noneAllowed: false };
  const newest = Math.max(
    ...dated.map((version) => time(version.datePublished)!),
  );
  const top = dated.filter((version) => time(version.datePublished) === newest);
  if (top.length > 1) return { ambiguous: true, noneAllowed: false };
  return { latest: top[0], ambiguous: false, noneAllowed: false };
}

/**
 * Decides whether a newer compatible version exists. `available` holds the versions Modrinth lists
 * for the pack's Minecraft version and loader. `currentFallback` describes the selected version
 * when it is not in that list. Never compares version-number strings.
 */
export function computeUpdateStatus(
  mod: Mod,
  available: ModrinthVersion[],
  currentFallback?: VersionSummary | null,
): UpdateResult {
  const meta = mod.modrinth;
  if (!meta) return { status: "unknown", reason: "Not linked to Modrinth." };
  const listed = available.find((version) => version.id === meta.versionId);
  const stored: VersionSummary | undefined =
    meta.versionId && meta.datePublished
      ? {
          id: meta.versionId,
          versionNumber: meta.versionNumber ?? "",
          versionType: meta.versionType ?? "release",
          datePublished: meta.datePublished,
        }
      : undefined;
  const current = listed ? summarize(listed) : (currentFallback ?? stored);
  const pick = pickLatest(available, current?.versionType ?? meta.versionType);
  const latest = pick.latest ? summarize(pick.latest) : undefined;
  const base = { checkedVersionId: meta.versionId, current, latest };

  if (!available.length)
    return {
      ...base,
      status: "unknown",
      reason:
        "Modrinth lists no versions for this pack's Minecraft version and modloader.",
    };
  if (!meta.versionId)
    return {
      ...base,
      status: "unknown",
      reason:
        "No Modrinth version is selected, so there is nothing to compare.",
    };
  if (pick.noneAllowed)
    return {
      ...base,
      status: "unknown",
      reason: "Only pre-release versions are available for this pack.",
    };
  if (pick.ambiguous || !latest)
    return {
      ...base,
      status: "unknown",
      reason:
        "Several versions share the newest publish date, so the latest one is unclear.",
    };
  if (latest.id === meta.versionId)
    return {
      ...base,
      status: "up-to-date",
      reason: "This is the newest compatible version.",
    };

  const currentTime = time(current?.datePublished);
  const latestTime = time(latest.datePublished)!;
  if (currentTime === null)
    return {
      ...base,
      status: "unknown",
      reason:
        "The selected version's publish date is unknown, so it cannot be compared.",
    };
  if (latestTime > currentTime)
    return {
      ...base,
      status: "update-available",
      reason: listed
        ? `Version ${latest.versionNumber} is newer.`
        : `Version ${latest.versionNumber} is newer. The selected version is not listed for this pack's Minecraft version and loader.`,
    };
  return {
    ...base,
    status: "unknown",
    reason:
      "The selected version is not older than the newest listed one, so the order is unclear.",
  };
}
