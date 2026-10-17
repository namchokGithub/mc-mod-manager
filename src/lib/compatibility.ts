import { loaderLabels, normalizeLoader } from "./modrinth/mapping";
import type { Mod, ModrinthDependency, Modpack } from "./schema";
import { matchMinecraftRange } from "./versionRange";

export type CompatStatus =
  "compatible" | "warning" | "incompatible" | "unknown";

export type CompatReason = {
  level: "error" | "warning" | "unknown" | "info";
  message: string;
};

/** Where the evidence came from. Source identification (e.g. CurseForge) is separate. */
export type Verification = "modrinth" | "jar" | "filename" | "manual";
export type CheckState = "pass" | "warn" | "fail" | "unknown";
export type CompatChecks = {
  minecraft: CheckState;
  loader: CheckState;
  dependencies: CheckState;
};

export type CompatResult = {
  status: CompatStatus;
  reasons: CompatReason[];
  source: "live" | "stored" | "none";
  verification: Verification;
  checks: CompatChecks;
  /** Where each check's evidence came from; manual entries can fill gaps in JAR metadata. */
  checkSources: Record<keyof CompatChecks, Verification>;
};

export const verificationLabels: Record<Verification, string> = {
  modrinth: "Modrinth",
  jar: "Local JAR",
  filename: "File name only",
  manual: "Manual",
};

const checkFromLevel: Record<CompatReason["level"], CheckState | null> = {
  error: "fail",
  warning: "warn",
  unknown: "unknown",
  info: null,
};
const checkRank: Record<CheckState, number> = {
  pass: 0,
  unknown: 1,
  warn: 2,
  fail: 3,
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

  // Mods found by their JAR mod ID, for dependencies declared in JAR metadata.
  const byModId = new Map<string, Mod[]>();
  for (const mod of mods)
    for (const key of new Set(
      [mod.id, mod.file?.modId, mod.modrinth?.slug].filter(
        (value): value is string => Boolean(value),
      ),
    ))
      byModId.set(key, [...(byModId.get(key) ?? []), mod]);

  for (const mod of active) {
    const { facts, source, missing } = resolved.get(mod.id)!;
    const reasons: CompatReason[] = [];
    const checks: CompatChecks = {
      minecraft: "pass",
      loader: "pass",
      dependencies: "pass",
    };
    const add = (
      check: keyof CompatChecks | null,
      level: CompatReason["level"],
      message: string,
    ) => {
      reasons.push({ level, message });
      const state = checkFromLevel[level];
      if (check && state && checkRank[state] > checkRank[checks[check]])
        checks[check] = state;
    };
    const unknownAll = (message: string) => {
      add(null, "unknown", message);
      checks.minecraft = checks.loader = checks.dependencies = "unknown";
    };
    const jar = mod.file?.format ? mod.file : undefined;
    const sources: Partial<Record<keyof CompatChecks, Verification>> = {};
    const manualVersions = mod.manualCompatibility?.gameVersions ?? [];
    const manualLoaders = mod.manualCompatibility?.loaders ?? [];
    const checkManualMinecraft = () => {
      sources.minecraft = "manual";
      if (!minecraft)
        add(
          "minecraft",
          "unknown",
          "Set the pack's Minecraft version to check this mod.",
        );
      else if (!manualVersions.includes(minecraft))
        add(
          "minecraft",
          "error",
          `The manually entered Minecraft versions (${summarizeVersions(manualVersions)}) do not include ${minecraft}.`,
        );
      else
        add(
          null,
          "info",
          `Minecraft ${minecraft} is in the manually entered versions (not verified).`,
        );
    };
    const checkManualLoader = () => {
      sources.loader = "manual";
      if (!loader)
        add("loader", "unknown", "Set the pack's modloader to check this mod.");
      else if (manualLoaders.includes(loader))
        add(
          null,
          "info",
          `${loaderLabels[loader]} is in the manually entered modloaders (not verified).`,
        );
      else if (loader === "quilt" && manualLoaders.includes("fabric"))
        add(
          "loader",
          "warning",
          "Entered manually as a Fabric mod. Quilt usually loads Fabric mods, but this is not guaranteed.",
        );
      else
        add(
          "loader",
          "error",
          `The manually entered modloaders (${manualLoaders.map(loaderName).join(", ")}) do not include ${loaderLabels[loader]}.`,
        );
    };
    let verification: Verification = facts ? "modrinth" : "manual";

    if (missing)
      add(
        null,
        "warning",
        "The selected Modrinth version was not found. It may have been deleted; choose another version.",
      );

    if (facts) {
      if (!minecraft)
        add(
          "minecraft",
          "unknown",
          "Set the pack's Minecraft version to check this mod.",
        );
      else if (!facts.gameVersions.includes(minecraft))
        add(
          "minecraft",
          "error",
          `Selected version supports Minecraft ${summarizeVersions(facts.gameVersions)}, not ${minecraft}.`,
        );

      if (!loader)
        add(
          "loader",
          "unknown",
          modpack.modloader.trim()
            ? `The pack modloader “${modpack.modloader}” is not recognized, so the loader cannot be checked.`
            : "Set the pack's modloader to check this mod.",
        );
      else if (!facts.loaders.includes(loader)) {
        if (loader === "quilt" && facts.loaders.includes("fabric"))
          add(
            "loader",
            "warning",
            "Selected version is for Fabric. Quilt usually loads Fabric mods, but this is not guaranteed.",
          );
        else
          add(
            "loader",
            "error",
            `Selected version is for ${facts.loaders.map(loaderName).join(", ") || "no listed loader"}, not ${loaderLabels[loader]}.`,
          );
      }

      for (const dependency of facts.dependencies) {
        if (dependency.type === "embedded") continue;
        if (!dependency.projectId) {
          if (dependency.type === "required")
            add(
              "dependencies",
              "warning",
              `A required dependency (${label(dependency)}) could not be identified on Modrinth.`,
            );
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
            add(
              "dependencies",
              "error",
              `Requires ${label(dependency)}, which is ${inactive.status} in this pack.`,
            );
          else if (nameMatch)
            add(
              "dependencies",
              "warning",
              `Requires ${label(dependency)}. “${nameMatch.name}” may provide it, but it has no Modrinth link to confirm.`,
            );
          else
            add(
              "dependencies",
              "error",
              `Missing required dependency: ${label(dependency)}.`,
            );
        } else if (dependency.type === "optional") {
          if (!activeProvider)
            add(
              "dependencies",
              "info",
              `Optional dependency ${label(dependency)} is not in the pack.`,
            );
        } else if (activeProvider) {
          add(
            "dependencies",
            "error",
            `Declared incompatible with ${activeProvider.name}, which is in this pack.`,
          );
        }
      }
    } else if (jar && jar.format !== "filename") {
      // No Modrinth facts: fall back to what the JAR itself declares. Not being on Modrinth is
      // never a problem by itself.
      verification = "jar";
      const format = jar.format ?? "";
      if (!minecraft)
        add(
          "minecraft",
          "unknown",
          "Set the pack's Minecraft version to check this mod.",
        );
      else if (!jar.minecraftRange) {
        if (manualVersions.length) checkManualMinecraft();
        else
          add(
            "minecraft",
            "unknown",
            "The JAR does not declare which Minecraft versions it supports.",
          );
      } else {
        const result = matchMinecraftRange(
          jar.minecraftRange,
          minecraft,
          format,
        );
        if (result === "mismatch")
          add(
            "minecraft",
            "error",
            `The JAR declares Minecraft ${jar.minecraftRange}; the pack uses ${minecraft}.`,
          );
        else if (result === "unknown") {
          if (manualVersions.length) checkManualMinecraft();
          else
            add(
              "minecraft",
              "unknown",
              `The JAR's Minecraft range “${jar.minecraftRange}” could not be checked against ${minecraft}.`,
            );
        }
      }

      const jarLoaders = jar.loaders ?? [];
      if (!loader)
        add(
          "loader",
          "unknown",
          modpack.modloader.trim()
            ? `The pack modloader “${modpack.modloader}” is not recognized, so the loader cannot be checked.`
            : "Set the pack's modloader to check this mod.",
        );
      else if (
        (!jarLoaders.length || jar.loadersInferred) &&
        manualLoaders.length
      )
        checkManualLoader();
      else if (!jarLoaders.length)
        add(
          "loader",
          "unknown",
          "The JAR does not say which modloader it needs.",
        );
      else if (jar.loadersInferred)
        add(
          "loader",
          "unknown",
          `The JAR only has a mods.toml without a loader dependency, so Forge and NeoForge cannot be told apart.`,
        );
      else if (!jarLoaders.includes(loader)) {
        if (loader === "quilt" && jarLoaders.includes("fabric"))
          add(
            "loader",
            "warning",
            "The JAR is for Fabric. Quilt usually loads Fabric mods, but this is not guaranteed.",
          );
        else
          add(
            "loader",
            "error",
            `The JAR is for ${jarLoaders.map(loaderName).join(", ")}, not ${loaderLabels[loader]}.`,
          );
      }

      for (const dependency of jar.dependencies ?? []) {
        const providers = (byModId.get(dependency.modId) ?? []).filter(
          (other) => other.id !== mod.id,
        );
        const activeProvider = providers.find(isActive);
        if (dependency.kind === "required") {
          if (activeProvider) continue;
          if (providers[0])
            add(
              "dependencies",
              "error",
              `Requires ${dependency.modId}, which is ${providers[0].status} in this pack.`,
            );
          else
            add(
              "dependencies",
              "warning",
              `Requires mod ID “${dependency.modId}”, and no mod with that ID is in the pack. It may be listed under another name.`,
            );
        } else if (dependency.kind === "optional") {
          if (!activeProvider)
            add(
              "dependencies",
              "info",
              `Optional dependency ${dependency.modId} is not in the pack.`,
            );
        } else if (activeProvider)
          add(
            "dependencies",
            dependency.kind === "incompatible" ? "error" : "warning",
            dependency.kind === "incompatible"
              ? `Declared incompatible with ${activeProvider.name}, which is in this pack.`
              : `Discourages using ${activeProvider.name}, which is in this pack.`,
          );
      }
    } else if (manualVersions.length || manualLoaders.length) {
      // Entered by hand: compared like other data but never presented as verified. File-name
      // guesses are ignored here.
      verification = "manual";
      if (manualVersions.length) checkManualMinecraft();
      else
        add(
          "minecraft",
          "unknown",
          "No supported Minecraft versions were entered.",
        );
      if (manualLoaders.length) checkManualLoader();
      else add("loader", "unknown", "No supported modloaders were entered.");
      checks.dependencies = "unknown";
      add(
        null,
        "info",
        "Dependencies are not checked for manually entered compatibility.",
      );
    } else if (jar) {
      verification = "filename";
      unknownAll(
        "Only the JAR's file name is known, so the Minecraft version, loader, and dependencies cannot be verified.",
      );
    } else if (!missing) {
      unknownAll(
        mod.modrinth
          ? "No Modrinth version is selected, so compatibility cannot be verified."
          : mod.file
            ? "Imported from a JAR before its metadata was saved. Import the file again to check it."
            : "Added without Modrinth or JAR metadata, so compatibility cannot be verified.",
      );
    } else checks.minecraft = checks.loader = checks.dependencies = "unknown";

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
          add(
            "dependencies",
            "error",
            `${other.name} declares itself incompatible with this mod.`,
          );
      }
      const duplicates = (byProject.get(projectId) ?? []).filter(
        (other) => other.id !== mod.id && isActive(other),
      );
      if (duplicates.length)
        add(
          null,
          "warning",
          `Same Modrinth project as ${duplicates.map((other) => other.name).join(", ")}.`,
        );
    }

    results.set(mod.id, {
      status: statusOf(reasons),
      reasons,
      source,
      verification,
      checks,
      checkSources: {
        minecraft: sources.minecraft ?? verification,
        loader: sources.loader ?? verification,
        dependencies: sources.dependencies ?? verification,
      },
    });
  }
  return results;
}

/**
 * Display label. Results decided by manually entered data read "Manual Match" or
 * "Manual Mismatch" so they are never mistaken for verified results.
 */
export function statusLabel(result: CompatResult): string {
  const checkKeys = Object.keys(result.checks) as (keyof CompatChecks)[];
  const usesManual = checkKeys.some(
    (check) => result.checkSources[check] === "manual",
  );
  if (result.status === "compatible" && usesManual) return "Manual Match";
  if (result.status === "incompatible") {
    const failing = checkKeys.filter(
      (check) => result.checks[check] === "fail",
    );
    if (
      failing.length &&
      failing.every((check) => result.checkSources[check] === "manual")
    )
      return "Manual Mismatch";
  }
  return compatLabels[result.status];
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
