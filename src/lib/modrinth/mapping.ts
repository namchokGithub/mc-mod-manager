import { uniqueId } from "../mods";
import {
  dependencyTypes,
  type Mod,
  type ModrinthDependency,
  type ModrinthMeta,
} from "../schema";
import type { ProjectResponse, SearchHit, VersionResponse } from "./api";

export const LOADERS = ["fabric", "forge", "neoforge", "quilt"] as const;
export type Loader = (typeof LOADERS)[number];

export const loaderLabels: Record<Loader, string> = {
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
  quilt: "Quilt",
};

// Modrinth mixes loaders and platforms into search categories; none of these are content categories.
const PLATFORM_TAGS = new Set<string>([
  ...LOADERS,
  "babric",
  "bta-babric",
  "bukkit",
  "bungeecord",
  "canvas",
  "datapack",
  "folia",
  "iris",
  "java-agent",
  "legacy-fabric",
  "liteloader",
  "minecraft",
  "modloader",
  "nilloader",
  "optifine",
  "ornithe",
  "paper",
  "purpur",
  "rift",
  "spigot",
  "sponge",
  "vanilla",
  "velocity",
  "waterfall",
]);

export type ModrinthProject = {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  iconUrl: string;
  categories: string[];
  clientSide: string;
  serverSide: string;
  sourceUrl: string;
};

export type ModrinthVersion = {
  id: string;
  projectId: string;
  name: string;
  versionNumber: string;
  versionType: string;
  gameVersions: string[];
  loaders: string[];
  datePublished: string;
  dependencies: ModrinthDependency[];
};

export function normalizeLoader(value: string): Loader | null {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  if (key === "neoforge") return "neoforge";
  if (key === "forge" || key === "minecraftforge") return "forge";
  if (key === "fabric") return "fabric";
  if (key === "quilt") return "quilt";
  return null;
}

export function projectUrl(slug: string): string {
  return `https://modrinth.com/mod/${encodeURIComponent(slug)}`;
}

export function projectFromHit(hit: SearchHit): ModrinthProject {
  return {
    id: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    author: hit.author,
    iconUrl: hit.icon_url ?? "",
    categories: hit.display_categories.length
      ? hit.display_categories
      : hit.categories,
    clientSide: hit.client_side,
    serverSide: hit.server_side,
    sourceUrl: projectUrl(hit.slug),
  };
}

export function projectFromResponse(project: ProjectResponse): ModrinthProject {
  return {
    id: project.id,
    slug: project.slug,
    title: project.title,
    description: project.description,
    author: "",
    iconUrl: project.icon_url ?? "",
    categories: project.categories,
    clientSide: project.client_side,
    serverSide: project.server_side,
    sourceUrl: projectUrl(project.slug),
  };
}

function isDependencyType(value: string): value is ModrinthDependency["type"] {
  return (dependencyTypes as readonly string[]).includes(value);
}

export function mapVersion(version: VersionResponse): ModrinthVersion {
  return {
    id: version.id,
    projectId: version.project_id,
    name: version.name,
    versionNumber: version.version_number,
    versionType: version.version_type,
    gameVersions: version.game_versions,
    loaders: version.loaders,
    datePublished: version.date_published,
    dependencies: version.dependencies.flatMap((dependency) =>
      isDependencyType(dependency.dependency_type)
        ? [
            {
              projectId: dependency.project_id ?? null,
              versionId: dependency.version_id ?? null,
              type: dependency.dependency_type,
            },
          ]
        : [],
    ),
  };
}

export function sideFromProject(
  project: Pick<ModrinthProject, "clientSide" | "serverSide">,
): Mod["side"] {
  if (
    project.serverSide === "unsupported" &&
    project.clientSide !== "unsupported"
  )
    return "client";
  if (
    project.clientSide === "unsupported" &&
    project.serverSide !== "unsupported"
  )
    return "server";
  return "both";
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function contentCategories(categories: string[]): string[] {
  return categories
    .filter((category) => !PLATFORM_TAGS.has(category.toLowerCase()))
    .map(titleCase);
}

export function metaFromVersion(
  project: Pick<ModrinthProject, "id" | "slug">,
  version: ModrinthVersion,
  syncedAt = new Date().toISOString(),
): ModrinthMeta {
  return {
    projectId: project.id,
    slug: project.slug,
    versionId: version.id,
    versionNumber: version.versionNumber,
    ...(version.versionType && { versionType: version.versionType }),
    ...(version.datePublished && { datePublished: version.datePublished }),
    gameVersions: version.gameVersions,
    loaders: version.loaders,
    dependencies: version.dependencies,
    syncedAt,
  };
}

export function modFromModrinth(
  project: ModrinthProject,
  version: ModrinthVersion,
  existingMods: Mod[],
  syncedAt?: string,
): Mod {
  const [category = "Other", ...tags] = contentCategories(project.categories);
  return {
    id: uniqueId(project.slug, existingMods),
    name: project.title,
    version: version.versionNumber,
    category,
    tags,
    status: "planned",
    side: sideFromProject(project),
    source: "Modrinth",
    sourceUrl: project.sourceUrl,
    description: project.description,
    dependencies: version.dependencies
      .filter((dependency) => dependency.type === "required")
      .map(
        (dependency) =>
          dependency.name ?? dependency.projectId ?? dependency.versionId ?? "",
      )
      .filter(Boolean),
    notes: "",
    imageUrl: project.iconUrl,
    modrinth: metaFromVersion(project, version, syncedAt),
  };
}

/**
 * Applies fresh Modrinth data to an existing mod. Only the version link is authoritative;
 * every other field is filled only when the user left it empty, so notes and edits survive.
 */
export function mergeModrinthIntoMod(existing: Mod, incoming: Mod): Mod {
  const fill = (current: string, next: string) => current.trim() || next;
  return {
    ...existing,
    version: incoming.version,
    sourceUrl: fill(existing.sourceUrl, incoming.sourceUrl),
    description: fill(existing.description, incoming.description),
    imageUrl: fill(existing.imageUrl, incoming.imageUrl),
    category: fill(existing.category, incoming.category),
    tags: existing.tags.length ? existing.tags : incoming.tags,
    dependencies: existing.dependencies.length
      ? existing.dependencies
      : incoming.dependencies,
    modrinth: incoming.modrinth,
  };
}
