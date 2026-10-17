import { compatLabels, verificationSourceLabels } from "./compatibility";
import { parseCurseForgeUrl, type CurseForgeUrl } from "./curseforge";
import { uniqueId } from "./mods";
import {
  contentCompatibility,
  type ContentCompat,
} from "./modrinth/contentImport";
import type { ContentItem, ContentType, ContentVerification } from "./schema";

const sameSet = (a: string[], b: string[]) => {
  const left = new Set(a.map((value) => value.trim()));
  const right = new Set(b.map((value) => value.trim()));
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
};

/** The user-confirmed snapshot covers the entry's active version and Minecraft versions. */
export function contentVerificationMatches(
  item: Pick<ContentItem, "version" | "minecraftVersions">,
  snapshot: ContentVerification | undefined,
): boolean {
  return Boolean(
    snapshot &&
    snapshot.version.trim() === item.version.trim() &&
    sameSet(snapshot.gameVersions, item.minecraftVersions),
  );
}

/** Modrinth data describes the active values: same version and the same Minecraft versions. */
export function modrinthMatchesContent(item: ContentItem): boolean {
  const meta = item.modrinth;
  if (!meta?.versionId || !meta.gameVersions) return false;
  const recorded = meta.versionNumber?.trim();
  return (
    (!recorded || recorded === item.version.trim()) &&
    sameSet(meta.gameVersions, item.minecraftVersions)
  );
}

export type ContentVerificationKind =
  "manual-verified" | "modrinth" | "stale" | "unverified";

export type ContentItemCompat = ContentCompat & {
  verification: ContentVerificationKind;
  /** The manual snapshot on record, current or not. */
  evidence?: ContentVerification;
};

/**
 * Compatibility of a saved entry. Precedence: a matching manual verification, then matching
 * Modrinth data, then the entered values, which are unverified. Evidence for other values
 * (an old manual check or an older Modrinth version) makes it "Needs Reverification".
 * Shader runtimes and listed dependencies always stay Unknown.
 */
export function contentItemCompat(
  item: ContentItem,
  type: ContentType,
  packMinecraft: string,
): ContentItemCompat {
  const snapshot = item.manualVerification;
  const meta = item.modrinth;
  const provider = {
    loaders: meta?.loaders ?? [],
    dependencies: meta?.dependencies ?? [],
  };
  const evidence = snapshot ? { evidence: snapshot } : {};
  if (snapshot && contentVerificationMatches(item, snapshot))
    return {
      ...contentCompatibility(
        { ...provider, gameVersions: snapshot.gameVersions },
        type,
        packMinecraft,
      ),
      verification: "manual-verified",
      ...evidence,
    };
  if (meta && modrinthMatchesContent(item))
    return {
      ...contentCompatibility(
        { ...provider, gameVersions: meta.gameVersions ?? [] },
        type,
        packMinecraft,
      ),
      verification: "modrinth",
      ...evidence,
    };
  const entered = contentCompatibility(
    { ...provider, gameVersions: item.minecraftVersions },
    type,
    packMinecraft,
  );
  if (snapshot || meta?.versionId) {
    const reasons: ContentCompat["reasons"] = [
      {
        level: "unknown",
        message: snapshot
          ? `Manually verified for version ${snapshot.version} with other Minecraft versions. The active values changed, so verify again.`
          : `Version ${item.version || "(blank)"} or its Minecraft versions differ from the Modrinth version that was checked (${meta?.versionNumber ?? "unknown"}).`,
      },
      ...entered.reasons,
    ];
    return {
      ...entered,
      status: entered.status === "incompatible" ? "incompatible" : "unknown",
      reasons,
      verification: "stale",
      ...evidence,
    };
  }
  return { ...entered, verification: "unverified" };
}

export function contentVerificationText(result: ContentItemCompat): string {
  switch (result.verification) {
    case "manual-verified":
      return `Manually Verified via ${result.evidence ? verificationSourceLabels[result.evidence.source] : "Other Source"}`;
    case "modrinth":
      return "Verified via Modrinth";
    case "stale":
      return "Needs Reverification";
    case "unverified":
      return "Unverified";
  }
}

/** Badge text; results from unverified entered values read "Manual Match" / "Manual Mismatch". */
export function contentStatusLabel(result: ContentItemCompat): string {
  if (result.verification === "unverified") {
    if (result.status === "compatible") return "Manual Match";
    if (result.status === "incompatible") return "Manual Mismatch";
  }
  return compatLabels[result.status];
}

/** "Modrinth", "CurseForge", or "Modrinth + CurseForge" when a CurseForge page is attached. */
export function contentSourceText(
  item: Pick<ContentItem, "source" | "curseforge">,
  labels: Record<ContentItem["source"], string>,
): string {
  return item.curseforge && item.source !== "curseforge"
    ? `${labels[item.source]} + CurseForge`
    : labels[item.source];
}

export type CurseForgeDuplicate = {
  item: ContentItem;
  /** "url" is the same CurseForge project; "possible" is a matching slug or name only. */
  match: "url" | "possible";
};

/**
 * Finds an entry that already is this CurseForge project (by its CurseForge reference or source
 * URL, file links compared by their project), or one that might be (same Modrinth slug or name).
 */
export function findCurseForgeDuplicate(
  items: ContentItem[],
  link: CurseForgeUrl,
): CurseForgeDuplicate | undefined {
  const projectOf = (url: string | undefined) => {
    const parsed = url ? parseCurseForgeUrl(url) : null;
    return parsed?.ok ? parsed.value.projectUrl : null;
  };
  const same = items.find(
    (item) =>
      projectOf(item.curseforge?.url) === link.projectUrl ||
      projectOf(item.sourceUrl) === link.projectUrl,
  );
  if (same) return { item: same, match: "url" };
  const possible = items.find(
    (item) =>
      item.modrinth?.slug?.toLowerCase() === link.slug ||
      uniqueId(item.name, []) === link.slug,
  );
  return possible ? { item: possible, match: "possible" } : undefined;
}
