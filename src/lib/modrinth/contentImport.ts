import type { CheckState, CompatStatus } from "../compatibility";
import { uniqueId } from "../mods";
import type { ContentItem, ContentType } from "../schema";
import type { SearchProjectType } from "./api";
import {
  metaFromVersion,
  projectUrl,
  type ModrinthProject,
  type ModrinthVersion,
} from "./mapping";
import { filterVersions, loaderLabel } from "./versionFilters";

/**
 * How each content type is found on Modrinth. Data packs use the "datapack" search facet, but
 * many of those projects also publish mod builds, so only versions with the "datapack" loader
 * are data pack files. Resource pack versions list "minecraft"; shader versions list shader
 * runtimes such as "iris" and "optifine".
 */
export const contentSearch: Record<
  ContentType,
  { projectType: SearchProjectType; versionLoader?: string }
> = {
  resourcepack: { projectType: "resourcepack" },
  datapack: { projectType: "datapack", versionLoader: "datapack" },
  shader: { projectType: "shader" },
};

/** Versions that are files of this content type; everything else is ignored. */
export function contentVersions(
  versions: ModrinthVersion[],
  type: ContentType,
): ModrinthVersion[] {
  const loader = contentSearch[type].versionLoader;
  return loader
    ? versions.filter((version) => version.loaders.includes(loader))
    : versions;
}

/** Newest first, filtered by Minecraft version only; modloader filters never apply here. */
export function filterContentVersions(
  versions: ModrinthVersion[],
  type: ContentType,
  filter: { gameVersion: string; showAll: boolean },
): ModrinthVersion[] {
  return filterVersions(contentVersions(versions, type), {
    gameVersion: filter.gameVersion,
    loader: "",
    showAll: filter.showAll,
  });
}

export type ContentChecks = {
  minecraft: CheckState;
  /** Shaders only: whether the pack has a runtime for it. Never decided in V2. */
  runtime?: CheckState;
  dependencies: CheckState;
};

export type ContentCompat = {
  status: CompatStatus;
  checks: ContentChecks;
  reasons: { level: "error" | "unknown" | "info"; message: string }[];
};

const rank: Record<CheckState, number> = {
  pass: 0,
  unknown: 1,
  warn: 2,
  fail: 3,
};

/**
 * Compatibility of one version for a non-mod collection. Only the Minecraft version is compared;
 * no modloader is required. Shader runtimes and dependencies are listed but stay Unknown, since
 * nothing reliable says whether the pack provides them.
 */
export function contentCompatibility(
  version: Pick<ModrinthVersion, "gameVersions" | "loaders" | "dependencies">,
  type: ContentType,
  packMinecraft: string,
): ContentCompat {
  const reasons: ContentCompat["reasons"] = [];
  const minecraft = packMinecraft.trim();
  let minecraftCheck: CheckState;
  if (!minecraft) {
    minecraftCheck = "unknown";
    reasons.push({
      level: "unknown",
      message: "Set the pack's Minecraft version to check this.",
    });
  } else if (!version.gameVersions.length) {
    minecraftCheck = "unknown";
    reasons.push({
      level: "unknown",
      message: "This version does not list any Minecraft versions.",
    });
  } else if (version.gameVersions.includes(minecraft)) minecraftCheck = "pass";
  else {
    minecraftCheck = "fail";
    reasons.push({
      level: "error",
      message: `Listed for Minecraft ${version.gameVersions.slice(0, 4).join(", ")}${version.gameVersions.length > 4 ? " …" : ""}, not ${minecraft}.`,
    });
  }

  const checks: ContentChecks = {
    minecraft: minecraftCheck,
    dependencies: "pass",
  };
  if (type === "shader") {
    checks.runtime = "unknown";
    reasons.push({
      level: "unknown",
      message: version.loaders.length
        ? `Made for ${version.loaders.map(loaderLabel).join(", ")}. Whether the pack has a matching shader runtime is not checked.`
        : "No shader runtime is listed, and runtime support is not checked.",
    });
  }
  const required = version.dependencies.filter(
    (dependency) => dependency.type === "required",
  );
  if (required.length) {
    checks.dependencies = "unknown";
    reasons.push({
      level: "unknown",
      message: `Lists ${required.length} required ${required.length === 1 ? "dependency" : "dependencies"}, which ${required.length === 1 ? "is" : "are"} kept but not checked.`,
    });
  }
  const worst = Object.values(checks).reduce<CheckState>(
    (current, state) => (rank[state] > rank[current] ? state : current),
    "pass",
  );
  return {
    status:
      worst === "fail"
        ? "incompatible"
        : worst === "unknown"
          ? "unknown"
          : worst === "warn"
            ? "warning"
            : "compatible",
    checks,
    reasons,
  };
}

/** Builds a collection entry from a Modrinth project and version; the ID is new and unique. */
export function contentItemFromModrinth(
  project: ModrinthProject,
  version: ModrinthVersion,
  type: ContentType,
  existing: ContentItem[],
  now = new Date(),
): ContentItem {
  const at = now.toISOString();
  return {
    id: uniqueId(project.slug, existing),
    name: project.title,
    status: "planned",
    version: version.versionNumber,
    description: project.description,
    source: "modrinth",
    sourceUrl: projectUrl(project.slug, type),
    imageUrl: project.iconUrl,
    minecraftVersions: version.gameVersions,
    tags: [],
    notes: "",
    createdAt: at,
    updatedAt: at,
    modrinth: metaFromVersion(project, version, at),
  };
}

// modrinth.com/<any project type>/<slug or ID>, with or without a trailing path.
const MODRINTH_URL = /^https?:\/\/(?:www\.)?modrinth\.com\/[a-z]+\/([^/?#]+)/i;

export type ContentDuplicate = {
  item: ContentItem;
  /** "project" and "url" are certain; "name" is only a possible match. */
  match: "project" | "url" | "name";
};

/**
 * Finds an entry in the destination collection that is this Modrinth project: by project ID,
 * then by a Modrinth source URL naming its slug or ID, then (as a hint only) by name.
 */
export function findContentDuplicate(
  items: ContentItem[],
  project: Pick<ModrinthProject, "id" | "slug" | "title">,
): ContentDuplicate | undefined {
  const byProject = items.find(
    (item) => item.modrinth?.projectId === project.id,
  );
  if (byProject) return { item: byProject, match: "project" };
  const keys = new Set([project.id.toLowerCase(), project.slug.toLowerCase()]);
  const byUrl = items.find((item) => {
    const slug = item.sourceUrl.match(MODRINTH_URL)?.[1];
    return (
      slug !== undefined && keys.has(decodeURIComponent(slug).toLowerCase())
    );
  });
  if (byUrl) return { item: byUrl, match: "url" };
  const name = project.title.trim().toLowerCase();
  const byName = items.find((item) => item.name.trim().toLowerCase() === name);
  return byName ? { item: byName, match: "name" } : undefined;
}
