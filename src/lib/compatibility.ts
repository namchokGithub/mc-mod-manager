import { loaderLabels, normalizeLoader } from "./modrinth/mapping";
import type { Mod, ModrinthDependency, Modpack } from "./schema";

export type CompatStatus =
  "compatible" | "warning" | "incompatible" | "unknown";

export type CompatReason = {
  level: "error" | "warning" | "unknown" | "info";
  message: string;
};

export type CompatResult = {
  status: CompatStatus;
  reasons: CompatReason[];
  source: "live" | "stored" | "none";
};

export type VersionFacts = {
  gameVersions: string[];
  loaders: string[];
  dependencies: ModrinthDependency[];
};

/** Live facts keyed by Modrinth version ID; `null` means Modrinth no longer has that version. */
export type LiveFacts = Map<string, VersionFacts | null>;

export const compatLabels: Record<CompatStatus, string> = {
  compatible: "Compatible",
  warning: "Warning",
  incompatible: "Incompatible",
  unknown: "Unknown",
};

export function isActive(mod: Mod): boolean {
  return mod.status !== "disabled" && mod.status !== "removed";
}

function summarizeVersions(values: string[]): string {
  if (!values.length) return "no versions";
  if (values.length <= 4) return values.join(", ");
  return `${values.slice(0, 2).join(", ")} … ${values.slice(-2).join(", ")}`;
}

function loaderName(value: string): string {
  const loader = normalizeLoader(value);
  return loader ? loaderLabels[loader] : value;
}

function resolveFacts(
  mod: Mod,
  live?: LiveFacts,
): {
  facts: VersionFacts | null;
  source: CompatResult["source"];
  missing: boolean;
} {
  const meta = mod.modrinth;
  if (meta?.versionId && live?.has(meta.versionId)) {
    const facts = live.get(meta.versionId) ?? null;
    if (facts) return { facts, source: "live", missing: false };
    return { facts: null, source: "live", missing: true };
  }
  if (meta?.versionId && meta.gameVersions && meta.loaders)
    return {
      facts: {
        gameVersions: meta.gameVersions,
        loaders: meta.loaders,
        dependencies: meta.dependencies ?? [],
      },
      source: "stored",
      missing: false,
    };
  return { facts: null, source: "none", missing: false };
}

function statusOf(reasons: CompatReason[]): CompatStatus {
  if (reasons.some((reason) => reason.level === "error")) return "incompatible";
  if (reasons.some((reason) => reason.level === "warning")) return "warning";
  if (reasons.some((reason) => reason.level === "unknown")) return "unknown";
  return "compatible";
}

/**
 * Checks every active mod against the pack. Read-only: never changes the mods.
 * Disabled and removed mods are not checked and do not satisfy dependencies.
 */
export function checkCompatibility(
  mods: Mod[],
  modpack: Modpack,
  live?: LiveFacts,
): Map<string, CompatResult> {
  const minecraft = modpack.minecraftVersion.trim();
  const loader = normalizeLoader(modpack.modloader);
  const active = mods.filter(isActive);
  const byProject = new Map<string, Mod[]>();
  for (const mod of mods) {
    const projectId = mod.modrinth?.projectId;
    if (projectId)
      byProject.set(projectId, [...(byProject.get(projectId) ?? []), mod]);
  }
  const knownNames = new Map<string, string>();
  for (const mod of mods) {
    if (mod.modrinth?.projectId)
      knownNames.set(mod.modrinth.projectId, mod.name);
    for (const dependency of mod.modrinth?.dependencies ?? [])
      if (
        dependency.projectId &&
        dependency.name &&
        !knownNames.has(dependency.projectId)
      )
        knownNames.set(dependency.projectId, dependency.name);
  }
  const label = (dependency: ModrinthDependency) =>
    (dependency.projectId && knownNames.get(dependency.projectId)) ||
    dependency.name ||
    dependency.projectId ||
    dependency.versionId ||
    "an unidentified project";

  const resolved = new Map(
    active.map((mod) => [mod.id, resolveFacts(mod, live)]),
  );
  const results = new Map<string, CompatResult>();

  for (const mod of active) {
    const { facts, source, missing } = resolved.get(mod.id)!;
    const reasons: CompatReason[] = [];

    if (missing)
      reasons.push({
        level: "warning",
        message:
          "The selected Modrinth version was not found. It may have been deleted; choose another version.",
      });
    else if (!facts)
      reasons.push({
        level: "unknown",
        message: mod.modrinth
          ? "No Modrinth version is selected, so compatibility cannot be verified."
          : "Added without Modrinth version metadata, so compatibility cannot be verified.",
      });

    if (facts) {
      if (!minecraft)
        reasons.push({
          level: "unknown",
          message: "Set the pack's Minecraft version to check this mod.",
        });
      else if (!facts.gameVersions.includes(minecraft))
        reasons.push({
          level: "error",
          message: `Selected version supports Minecraft ${summarizeVersions(facts.gameVersions)}, not ${minecraft}.`,
        });

      if (!loader)
        reasons.push({
          level: "unknown",
          message: modpack.modloader.trim()
            ? `The pack modloader “${modpack.modloader}” is not recognized, so the loader cannot be checked.`
            : "Set the pack's modloader to check this mod.",
        });
      else if (!facts.loaders.includes(loader)) {
        if (loader === "quilt" && facts.loaders.includes("fabric"))
          reasons.push({
            level: "warning",
            message:
              "Selected version is for Fabric. Quilt usually loads Fabric mods, but this is not guaranteed.",
          });
        else
          reasons.push({
            level: "error",
            message: `Selected version is for ${facts.loaders.map(loaderName).join(", ") || "no listed loader"}, not ${loaderLabels[loader]}.`,
          });
      }

      for (const dependency of facts.dependencies) {
        if (dependency.type === "embedded") continue;
        if (!dependency.projectId) {
          if (dependency.type === "required")
            reasons.push({
              level: "warning",
              message: `A required dependency (${label(dependency)}) could not be identified on Modrinth.`,
            });
          continue;
        }
        const providers = byProject.get(dependency.projectId) ?? [];
        const activeProvider = providers.find(isActive);
        if (dependency.type === "required") {
          if (activeProvider) continue;
          const inactive = providers[0];
          const nameMatch = active.find(
            (other) =>
              !other.modrinth &&
              other.name.trim().toLowerCase() ===
                label(dependency).toLowerCase(),
          );
          if (inactive)
            reasons.push({
              level: "error",
              message: `Requires ${label(dependency)}, which is ${inactive.status} in this pack.`,
            });
          else if (nameMatch)
            reasons.push({
              level: "warning",
              message: `Requires ${label(dependency)}. “${nameMatch.name}” may provide it, but it has no Modrinth link to confirm.`,
            });
          else
            reasons.push({
              level: "error",
              message: `Missing required dependency: ${label(dependency)}.`,
            });
        } else if (dependency.type === "optional") {
          if (!activeProvider)
            reasons.push({
              level: "info",
              message: `Optional dependency ${label(dependency)} is not in the pack.`,
            });
        } else if (activeProvider) {
          reasons.push({
            level: "error",
            message: `Declared incompatible with ${activeProvider.name}, which is in this pack.`,
          });
        }
      }
    }

    const projectId = mod.modrinth?.projectId;
    if (projectId) {
      for (const other of active) {
        if (other.id === mod.id) continue;
        const otherFacts = resolved.get(other.id)?.facts;
        if (
          otherFacts?.dependencies.some(
            (dependency) =>
              dependency.type === "incompatible" &&
              dependency.projectId === projectId,
          )
        )
          reasons.push({
            level: "error",
            message: `${other.name} declares itself incompatible with this mod.`,
          });
      }
      const duplicates = (byProject.get(projectId) ?? []).filter(
        (other) => other.id !== mod.id && isActive(other),
      );
      if (duplicates.length)
        reasons.push({
          level: "warning",
          message: `Same Modrinth project as ${duplicates.map((other) => other.name).join(", ")}.`,
        });
    }

    results.set(mod.id, { status: statusOf(reasons), reasons, source });
  }
  return results;
}

export function countByStatus(
  results: Map<string, CompatResult>,
): Record<CompatStatus, number> {
  const counts: Record<CompatStatus, number> = {
    compatible: 0,
    warning: 0,
    incompatible: 0,
    unknown: 0,
  };
  for (const result of results.values()) counts[result.status] += 1;
  return counts;
}

/** Returns the existing mod already linked to a Modrinth project, if any. */
export function findByProject(
  mods: Mod[],
  projectId: string,
  exceptId?: string,
): Mod | undefined {
  return mods.find(
    (mod) => mod.modrinth?.projectId === projectId && mod.id !== exceptId,
  );
}
