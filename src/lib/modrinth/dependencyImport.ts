import { findByProject } from "../compatibility";
import type { Mod } from "../schema";
import { ModrinthError, type ModrinthClient } from "./api";
import {
  modFromModrinth,
  projectFromResponse,
  type ModrinthProject,
  type ModrinthVersion,
} from "./mapping";
import { cachedProjectVersions, resolveDependencyVersions } from "./service";
import { filterVersions, loaderLabel, packMismatches } from "./versionFilters";

/** A required or optional dependency named directly by the version being added. */
export type DirectDependency = {
  /** The project ID, or `version:<id>` when Modrinth only gave a version ID. */
  key: string;
  projectId: string | null;
  /** The exact version the dependency asks for, when it names one. */
  versionId: string | null;
  name: string;
  type: "required" | "optional";
};

export type DependencyResolution =
  | {
      status: "resolved";
      project: ModrinthProject;
      version: ModrinthVersion;
      /** Set when the chosen version is not a release. */
      note?: string;
    }
  | { status: "unresolved"; reason: string };

export type PackTarget = { gameVersion: string; loader: string };

export type SelectedDependency = {
  project: ModrinthProject;
  version: ModrinthVersion;
};

export type ImportPlan = {
  /** The main mod first, then the dependencies, with unique IDs. */
  created: Mod[];
  /** Selected dependencies left out because the collection or this import already has them. */
  skipped: { name: string; reason: string }[];
  /** Required dependencies of the new mods that will still be missing after adding. */
  stillMissing: { modName: string; dependencyName: string }[];
};

/**
 * Required and optional dependencies of one version, one entry per project. Embedded and
 * incompatible entries are not added, and a dependency on the project itself is ignored.
 */
export function directDependencies(
  version: ModrinthVersion,
): DirectDependency[] {
  const byKey = new Map<string, DirectDependency>();
  for (const dependency of version.dependencies) {
    if (dependency.type !== "required" && dependency.type !== "optional")
      continue;
    if (dependency.projectId === version.projectId) continue;
    const key =
      dependency.projectId ??
      (dependency.versionId ? `version:${dependency.versionId}` : null);
    if (!key) continue;
    const current = byKey.get(key);
    // Listed twice: required wins over optional.
    if (
      current &&
      (current.type === "required" || dependency.type !== "required")
    )
      continue;
    byKey.set(key, {
      key,
      projectId: dependency.projectId,
      versionId: dependency.versionId,
      name:
        dependency.name ??
        dependency.projectId ??
        `Unknown project (version ${dependency.versionId})`,
      type: dependency.type,
    });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      Number(a.type === "optional") - Number(b.type === "optional") ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Picks the version to add for a dependency. An exact version the dependency asks for is used
 * only when it is listed for the pack; otherwise the newest release for the pack's Minecraft
 * version and loader, then the newest beta or alpha.
 */
export function chooseDependencyVersion(
  versions: ModrinthVersion[],
  dependency: Pick<DirectDependency, "versionId">,
  pack: PackTarget,
): { version: ModrinthVersion; note?: string } | { reason: string } {
  if (!pack.gameVersion || !pack.loader)
    return {
      reason:
        "Set the pack's Minecraft version and a supported modloader to find a matching version.",
    };
  if (dependency.versionId) {
    const pinned = versions.find(
      (version) => version.id === dependency.versionId,
    );
    if (!pinned)
      return {
        reason: `The exact version it asks for (${dependency.versionId}) is not listed on Modrinth.`,
      };
    const mismatches = packMismatches(pinned, pack);
    return mismatches.length
      ? {
          reason: `The exact version it asks for (${pinned.versionNumber}) is not listed for ${mismatches.join(" or ")}.`,
        }
      : { version: pinned };
  }
  const matching = filterVersions(versions, { ...pack, showAll: false });
  const release = matching.find((version) => version.versionType === "release");
  if (release) return { version: release };
  const newest = matching[0];
  if (!newest)
    return {
      reason: `No version is listed for Minecraft ${pack.gameVersion} with ${loaderLabel(pack.loader)}.`,
    };
  return {
    version: newest,
    note: `No release for this pack; the newest ${newest.versionType} is used.`,
  };
}

const failureReason = (error: unknown) =>
  error instanceof ModrinthError
    ? error.message
    : "Could not load its versions from Modrinth.";

/**
 * Finds a version to add for each dependency. Version lists come from the shared cache, so a
 * project already loaded by the picker or update checker is not fetched again. One dependency
 * failing marks only that dependency as unresolved; a failed project lookup fails the whole call.
 */
export async function resolveDirectDependencies(
  client: ModrinthClient,
  dependencies: DirectDependency[],
  pack: PackTarget,
  signal?: AbortSignal,
): Promise<Map<string, DependencyResolution>> {
  const results = new Map<string, DependencyResolution>();
  const projectIds = [
    ...new Set(
      dependencies.flatMap((dependency) =>
        dependency.projectId ? [dependency.projectId] : [],
      ),
    ),
  ];
  const projects = new Map(
    projectIds.length
      ? (await client.projects(projectIds, signal)).map((project) => [
          project.id,
          projectFromResponse(project),
        ])
      : [],
  );
  type Chosen =
    | {
        dependency: DirectDependency;
        resolved: SelectedDependency;
        note?: string;
      }
    | { dependency: DirectDependency; reason: string };
  const chosen = await Promise.all(
    dependencies.map(async (dependency): Promise<Chosen> => {
      const project = dependency.projectId
        ? projects.get(dependency.projectId)
        : undefined;
      if (!dependency.projectId)
        return {
          dependency,
          reason: "Modrinth did not say which project this is.",
        };
      if (!project)
        return {
          dependency,
          reason: "Modrinth no longer lists this project.",
        };
      try {
        const versions = await cachedProjectVersions(client, project.id);
        const pick = chooseDependencyVersion(versions, dependency, pack);
        return "reason" in pick
          ? { dependency, reason: pick.reason }
          : {
              dependency,
              resolved: { project, version: pick.version },
              note: pick.note,
            };
      } catch (error) {
        return { dependency, reason: failureReason(error) };
      }
    }),
  );
  signal?.throwIfAborted();

  const picked = chosen.flatMap((item) =>
    "resolved" in item ? [item.resolved.version] : [],
  );
  // Fills project IDs and names for the transitive warnings; the IDs alone are enough to warn.
  let named: ModrinthVersion[] = picked;
  try {
    named = await resolveDependencyVersions(client, picked, signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
  }
  const byId = new Map(named.map((version) => [version.id, version]));

  for (const item of chosen)
    results.set(
      item.dependency.key,
      "resolved" in item
        ? {
            status: "resolved",
            project: item.resolved.project,
            version:
              byId.get(item.resolved.version.id) ?? item.resolved.version,
            ...(item.note && { note: item.note }),
          }
        : { status: "unresolved", reason: item.reason },
    );
  return results;
}

/**
 * Required dependencies of a dependency's version that are not covered by `present` (project
 * IDs in the collection or this import). These are shown as warnings and never added.
 */
export function transitiveNeeds(
  version: Pick<ModrinthVersion, "projectId" | "dependencies">,
  present: ReadonlySet<string>,
): string[] {
  const names = version.dependencies.flatMap((dependency) =>
    dependency.type === "required" &&
    dependency.projectId !== version.projectId &&
    !(dependency.projectId && present.has(dependency.projectId))
      ? [
          dependency.name ??
            dependency.projectId ??
            `Unknown project (version ${dependency.versionId})`,
        ]
      : [],
  );
  return [...new Set(names)];
}

/** Dependency choices for one main version; a different version starts fresh. */
export type DependencyChoice = {
  versionId: string;
  include?: boolean;
  expanded?: boolean;
  /** Checkbox changes by dependency key; unset keys use the default. */
  picks: Record<string, boolean>;
};

export function choiceFor(
  choice: DependencyChoice | null,
  versionId: string | undefined,
): DependencyChoice {
  return choice && choice.versionId === versionId
    ? choice
    : { versionId: versionId ?? "", picks: {} };
}

/**
 * Applies the defaults: the section is on and open when a required dependency is missing,
 * required dependencies are selected and optional ones are not. Only resolved dependencies that
 * are not in the collection can be selected.
 */
export function selectDependencies(
  direct: DirectDependency[],
  resolutions: ReadonlyMap<string, DependencyResolution> | undefined,
  mods: Mod[],
  choice: DependencyChoice,
): {
  missing: DirectDependency[];
  include: boolean;
  expanded: boolean;
  selected: (SelectedDependency & { dependency: DirectDependency })[];
} {
  const missing = direct.filter(
    (dependency) =>
      !(dependency.projectId && findByProject(mods, dependency.projectId)),
  );
  const requiredMissing = missing.some(
    (dependency) => dependency.type === "required",
  );
  const include = choice.include ?? requiredMissing;
  const selected = include
    ? missing.flatMap((dependency) => {
        const resolution = resolutions?.get(dependency.key);
        return resolution?.status === "resolved" &&
          (choice.picks[dependency.key] ?? dependency.type === "required")
          ? [
              {
                dependency,
                project: resolution.project,
                version: resolution.version,
              },
            ]
          : [];
      })
    : [];
  return {
    missing,
    include,
    expanded: choice.expanded ?? requiredMissing,
    selected,
  };
}

/**
 * Builds the mods to add: the main mod, then each selected dependency through the same creation
 * logic as a single Modrinth add. Never replaces or changes an existing mod.
 */
export function planModrinthImport(
  main: Mod,
  selected: SelectedDependency[],
  mods: Mod[],
): ImportPlan {
  const created: Mod[] = [main];
  const skipped: ImportPlan["skipped"] = [];
  for (const { project, version } of selected) {
    const existing = findByProject(mods, project.id);
    if (existing) {
      skipped.push({
        name: project.title,
        reason: `Already in the collection as “${existing.name}”`,
      });
      continue;
    }
    if (findByProject(created, project.id)) {
      skipped.push({ name: project.title, reason: "Already in this import" });
      continue;
    }
    created.push(modFromModrinth(project, version, [...mods, ...created]));
  }

  const present = new Set(
    [...mods, ...created].flatMap((mod) =>
      mod.modrinth ? [mod.modrinth.projectId] : [],
    ),
  );
  const stillMissing: ImportPlan["stillMissing"] = [];
  for (const mod of created) {
    const meta = mod.modrinth;
    if (!meta?.dependencies) continue;
    for (const dependencyName of transitiveNeeds(
      { projectId: meta.projectId, dependencies: meta.dependencies },
      present,
    ))
      stillMissing.push({ modName: mod.name, dependencyName });
  }
  return { created, skipped, stillMissing };
}
