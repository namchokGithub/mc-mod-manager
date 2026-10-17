import type { Mod } from "../schema";
import type { VersionFacts } from "../compatibility";
import type { ModrinthClient } from "./api";
import { mapVersion, type ModrinthVersion } from "./mapping";

/**
 * Fills dependency project IDs that Modrinth only gave as version IDs, and adds display names.
 * Name lookup is best effort; a failed lookup keeps the IDs.
 */
export async function resolveDependencies(
  client: ModrinthClient,
  version: ModrinthVersion,
  signal?: AbortSignal,
): Promise<ModrinthVersion> {
  const missing = version.dependencies
    .filter((dependency) => !dependency.projectId && dependency.versionId)
    .map((dependency) => dependency.versionId as string);
  const projectByVersion = new Map<string, string>();
  if (missing.length) {
    for (const item of await client.versions(missing, signal))
      projectByVersion.set(item.id, item.project_id);
  }
  const dependencies = version.dependencies.map((dependency) =>
    dependency.projectId || !dependency.versionId
      ? dependency
      : {
          ...dependency,
          projectId: projectByVersion.get(dependency.versionId) ?? null,
        },
  );
  const projectIds = dependencies
    .filter((dependency) => dependency.type !== "embedded")
    .flatMap((dependency) =>
      dependency.projectId ? [dependency.projectId] : [],
    );
  const names = new Map<string, string>();
  if (projectIds.length) {
    try {
      for (const project of await client.projects(projectIds, signal))
        names.set(project.id, project.title);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
    }
  }
  return {
    ...version,
    dependencies: dependencies.map((dependency) => {
      const name = dependency.projectId
        ? names.get(dependency.projectId)
        : undefined;
      return name ? { ...dependency, name } : dependency;
    }),
  };
}

/**
 * Fetches the current metadata of every linked version. Versions Modrinth no longer returns map to null.
 * Read-only: the result is for checking and is never written back to the mods.
 */
export async function fetchLiveVersionFacts(
  client: ModrinthClient,
  mods: Mod[],
  signal?: AbortSignal,
): Promise<Map<string, VersionFacts | null>> {
  const versionIds = mods.flatMap((mod) =>
    mod.modrinth?.versionId ? [mod.modrinth.versionId] : [],
  );
  const facts = new Map<string, VersionFacts | null>(
    versionIds.map((id) => [id, null]),
  );
  if (!versionIds.length) return facts;
  const versions = (await client.versions(versionIds, signal)).map(mapVersion);
  const unresolved = versions.flatMap((version) =>
    version.dependencies.flatMap((dependency) =>
      !dependency.projectId && dependency.versionId
        ? [dependency.versionId]
        : [],
    ),
  );
  const projectByVersion = new Map<string, string>();
  if (unresolved.length) {
    for (const item of await client.versions(unresolved, signal))
      projectByVersion.set(item.id, item.project_id);
  }
  for (const version of versions) {
    facts.set(version.id, {
      gameVersions: version.gameVersions,
      loaders: version.loaders,
      dependencies: version.dependencies.map((dependency) =>
        dependency.projectId || !dependency.versionId
          ? dependency
          : {
              ...dependency,
              projectId: projectByVersion.get(dependency.versionId) ?? null,
            },
      ),
    });
  }
  return facts;
}
