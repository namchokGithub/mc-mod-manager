import {
  modFromModrinth,
  type ModrinthProject,
  type ModrinthVersion,
} from "../modrinth/mapping";
import { uniqueId } from "../mods";
import type { Mod } from "../schema";
import type { JarMetadata } from "./metadata";

export type JarMatch = { project: ModrinthProject; version: ModrinthVersion };

export type ImportCandidate = {
  key: string;
  metadata: JarMetadata;
  sha1?: string;
  /** Undefined until looked up; null when Modrinth had no file with this hash. */
  match?: JarMatch | null;
};

export type Duplicate = { reason: string; modName: string; modId?: string };

const normalize = (value: string | undefined) =>
  (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export async function sha1Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Finds the strongest reason a file is already in the pack: same file, project, mod ID, then name. */
export function findPackDuplicate(
  candidate: ImportCandidate,
  mods: Mod[],
): Duplicate | null {
  const { metadata, sha1, match } = candidate;
  const checks: [string, (mod: Mod) => boolean][] = [
    ["Same file", (mod) => Boolean(sha1 && mod.file?.sha1 === sha1)],
    [
      "Same Modrinth project",
      (mod) => Boolean(match && mod.modrinth?.projectId === match.project.id),
    ],
    [
      "Same mod ID",
      (mod) =>
        Boolean(
          metadata.modId &&
          (mod.file?.modId === metadata.modId || mod.id === metadata.modId),
        ),
    ],
    [
      "Same name",
      (mod) => {
        const name = normalize(match?.project.title ?? metadata.name);
        return Boolean(name && normalize(mod.name) === name);
      },
    ],
  ];
  for (const [reason, test] of checks) {
    const mod = mods.find(test);
    if (mod) return { reason, modName: mod.name, modId: mod.id };
  }
  return null;
}

/** Marks later files that repeat an earlier file in the same selection. */
export function findBatchDuplicates(
  candidates: ImportCandidate[],
): Map<string, Duplicate> {
  const seen = new Map<string, string>();
  const duplicates = new Map<string, Duplicate>();
  for (const candidate of candidates) {
    const keys = [
      candidate.sha1 && `sha1:${candidate.sha1}`,
      candidate.match && `project:${candidate.match.project.id}`,
      candidate.metadata.modId && `mod:${candidate.metadata.modId}`,
    ].filter((key): key is string => Boolean(key));
    const earlier = keys.map((key) => seen.get(key)).find(Boolean);
    if (earlier)
      duplicates.set(candidate.key, {
        reason: "Repeats another selected file",
        modName: earlier,
      });
    else for (const key of keys) seen.set(key, candidate.metadata.fileName);
  }
  return duplicates;
}

/** Builds a mod entry. A Modrinth match supplies verified metadata; otherwise local data is used. */
export function candidateToMod(
  candidate: ImportCandidate,
  existing: Mod[],
  syncedAt?: string,
): Mod {
  const { metadata, match, sha1 } = candidate;
  const file = {
    name: metadata.fileName.replace(/^.*[\\/]/, ""),
    ...(sha1 && { sha1 }),
    ...(metadata.modId && { modId: metadata.modId }),
    format: metadata.format,
    ...(metadata.loaders.length > 0 && { loaders: metadata.loaders }),
    ...(metadata.loadersInferred && { loadersInferred: true }),
    ...(metadata.minecraftRange && { minecraftRange: metadata.minecraftRange }),
    ...(metadata.dependencies.length > 0 && {
      dependencies: metadata.dependencies.map((dependency) => ({
        modId: dependency.modId,
        kind: dependency.kind,
        ...(dependency.versionRange && {
          versionRange: dependency.versionRange,
        }),
      })),
    }),
  };
  const notes = `Imported from ${file.name}.`;
  if (match)
    return {
      ...modFromModrinth(match.project, match.version, existing, syncedAt),
      status: "planned",
      notes,
      file,
    };
  const name =
    metadata.name ?? metadata.modId ?? file.name.replace(/\.jar$/i, "");
  return {
    id: uniqueId(metadata.modId ?? name, existing),
    name,
    version: metadata.version ?? "",
    category: "Uncategorized",
    tags: metadata.loaders.map(
      (loader) => loader.charAt(0).toUpperCase() + loader.slice(1),
    ),
    status: "planned",
    side: metadata.side ?? "both",
    source: "Other",
    sourceUrl: metadata.homepage ?? "",
    description: metadata.description ?? "",
    dependencies: metadata.dependencies
      .filter((dependency) => dependency.kind === "required")
      .map((dependency) => dependency.modId),
    notes,
    imageUrl: "",
    file,
  };
}

/**
 * Applies a JAR (and its Modrinth match, if any) to a mod already in the list, for example one
 * added by name only. ID, name, status, side, notes, and batch references are kept; text fields
 * are only filled when empty; the JAR metadata and a verified Modrinth match are attached.
 */
export function mergeCandidateIntoMod(
  existing: Mod,
  candidate: ImportCandidate,
  syncedAt?: string,
): Mod {
  const incoming = candidateToMod(candidate, [], syncedAt);
  const fill = (current: string, next: string) => current.trim() || next;
  return {
    ...existing,
    version: fill(existing.version, incoming.version),
    sourceUrl: fill(existing.sourceUrl, incoming.sourceUrl),
    description: fill(existing.description, incoming.description),
    imageUrl: fill(existing.imageUrl, incoming.imageUrl),
    tags: existing.tags.length ? existing.tags : incoming.tags,
    dependencies: existing.dependencies.length
      ? existing.dependencies
      : incoming.dependencies,
    ...(incoming.file && { file: incoming.file }),
    // Only a hash match is verified; without one, existing Modrinth data is left alone.
    ...(incoming.modrinth && { modrinth: incoming.modrinth }),
  };
}
