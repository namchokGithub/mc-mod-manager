import type { Mod } from "../schema";
import type { VersionFacts } from "../compatibility";
import {
  computeUpdateStatus,
  summarize,
  type UpdateResult,
  type VersionSummary,
} from "../updates";
import { ModrinthError, type ModrinthClient } from "./api";
import {
  mapVersion,
  projectFromResponse,
  type ModrinthProject,
  type ModrinthVersion,
} from "./mapping";

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

const CACHE_MS = 5 * 60_000;
const versionCache = new Map<
  string,
  { at: number; promise: Promise<ModrinthVersion[]> }
>();

export function clearVersionCache(): void {
  versionCache.clear();
}

/**
 * Project version lists, shared for five minutes so the picker and the update checker never fetch
 * the same list twice. Failed requests are dropped from the cache so a retry refetches.
 */
export function cachedProjectVersions(
  client: ModrinthClient,
  projectId: string,
  filters: { gameVersion?: string; loader?: string } = {},
): Promise<ModrinthVersion[]> {
  const key = JSON.stringify([
    projectId,
    filters.gameVersion ?? "",
    filters.loader ?? "",
  ]);
  const hit = versionCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = client
    .projectVersions(projectId, filters)
    .then((list) => list.map(mapVersion));
  promise.catch(() => {
    if (versionCache.get(key)?.promise === promise) versionCache.delete(key);
  });
  versionCache.set(key, { at: Date.now(), promise });
  return promise;
}

export type UpdateCheck = {
  results: Map<string, UpdateResult>;
  /** Set when checking stopped early, such as on a rate limit. */
  error?: ModrinthError;
};

/**
 * Checks linked mods for newer compatible versions. Each project is fetched once, at most
 * `concurrency` at a time; a rate limit stops new requests and leaves the rest Unknown.
 */
export async function checkUpdates(
  client: ModrinthClient,
  mods: Mod[],
  filters: { gameVersion?: string; loader?: string },
  concurrency = 4,
): Promise<UpdateCheck> {
  const results = new Map<string, UpdateResult>();
  if (!filters.gameVersion || !filters.loader) {
    for (const mod of mods)
      results.set(mod.id, {
        status: "unknown",
        reason:
          "Set the pack's Minecraft version and a supported modloader to check updates.",
      });
    return { results };
  }
  const projectIds = [
    ...new Set(
      mods.flatMap((mod) => (mod.modrinth ? [mod.modrinth.projectId] : [])),
    ),
  ];
  const lists = new Map<string, ModrinthVersion[] | ModrinthError>();
  let stopped: ModrinthError | undefined;
  let next = 0;
  const worker = async () => {
    while (!stopped && next < projectIds.length) {
      const projectId = projectIds[next++];
      try {
        lists.set(
          projectId,
          await cachedProjectVersions(client, projectId, filters),
        );
      } catch (error) {
        const failure =
          error instanceof ModrinthError
            ? error
            : new ModrinthError("network", "Could not reach Modrinth.");
        lists.set(projectId, failure);
        if (failure.kind === "rate-limit" || failure.kind === "network")
          stopped = failure;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, projectIds.length) }, worker),
  );

  // Selected versions that the filtered lists do not include and whose date was never saved.
  const missing = mods.flatMap((mod) => {
    const meta = mod.modrinth;
    const list = meta ? lists.get(meta.projectId) : undefined;
    return meta?.versionId &&
      !meta.datePublished &&
      Array.isArray(list) &&
      !list.some((version) => version.id === meta.versionId)
      ? [meta.versionId]
      : [];
  });
  const fallback = new Map<string, VersionSummary>();
  if (missing.length && !stopped) {
    try {
      for (const version of await client.versions(missing))
        fallback.set(version.id, summarize(mapVersion(version)));
    } catch (error) {
      if (error instanceof ModrinthError && error.kind === "rate-limit")
        stopped = error;
    }
  }

  for (const mod of mods) {
    const meta = mod.modrinth;
    const list = meta ? lists.get(meta.projectId) : undefined;
    if (!meta) results.set(mod.id, computeUpdateStatus(mod, []));
    else if (list === undefined)
      results.set(mod.id, {
        status: "unknown",
        reason: "Not checked because Modrinth stopped accepting requests.",
        checkedVersionId: meta.versionId,
      });
    else if (list instanceof ModrinthError)
      results.set(mod.id, {
        status: "unknown",
        reason: list.message,
        checkedVersionId: meta.versionId,
      });
    else
      results.set(
        mod.id,
        computeUpdateStatus(
          mod,
          list,
          meta.versionId ? fallback.get(meta.versionId) : undefined,
        ),
      );
  }
  return { results, error: stopped };
}

export type HashMatch = { project: ModrinthProject; version: ModrinthVersion };

/** Identifies local files by SHA-1 on Modrinth. Unmatched hashes are absent from the result. */
export async function matchFilesByHash(
  client: ModrinthClient,
  hashes: string[],
  signal?: AbortSignal,
): Promise<Map<string, HashMatch>> {
  const byHash = await client.versionsByHashes(hashes, signal);
  const entries = Object.entries(byHash).map(
    ([hash, version]) => [hash, mapVersion(version)] as const,
  );
  const unresolved = entries.flatMap(([, version]) =>
    version.dependencies.flatMap((dependency) =>
      !dependency.projectId && dependency.versionId
        ? [dependency.versionId]
        : [],
    ),
  );
  const projectByVersion = new Map<string, string>();
  if (unresolved.length)
    for (const item of await client.versions(unresolved, signal))
      projectByVersion.set(item.id, item.project_id);
  const resolved = entries.map(
    ([hash, version]) =>
      [
        hash,
        {
          ...version,
          dependencies: version.dependencies.map((dependency) =>
            dependency.projectId || !dependency.versionId
              ? dependency
              : {
                  ...dependency,
                  projectId: projectByVersion.get(dependency.versionId) ?? null,
                },
          ),
        },
      ] as const,
  );
  const projectIds = resolved.flatMap(([, version]) => [
    version.projectId,
    ...version.dependencies.flatMap((dependency) =>
      dependency.projectId && dependency.type !== "embedded"
        ? [dependency.projectId]
        : [],
    ),
  ]);
  const projects = new Map(
    projectIds.length
      ? (await client.projects(projectIds, signal)).map((project) => [
          project.id,
          project,
        ])
      : [],
  );
  const matches = new Map<string, HashMatch>();
  for (const [hash, version] of resolved) {
    const project = projects.get(version.projectId);
    if (!project) continue;
    matches.set(hash, {
      project: projectFromResponse(project),
      version: {
        ...version,
        dependencies: version.dependencies.map((dependency) => {
          const name = dependency.projectId
            ? projects.get(dependency.projectId)?.title
            : undefined;
          return name ? { ...dependency, name } : dependency;
        }),
      },
    });
  }
  return matches;
}
