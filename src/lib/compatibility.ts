import { loaderLabels, normalizeLoader } from "./modrinth/mapping";
import type {
  ManualVerification,
  Mod,
  ModrinthDependency,
  Modpack,
} from "./schema";
import { matchMinecraftRange } from "./versionRange";

export type CompatStatus =
  "compatible" | "warning" | "incompatible" | "unknown";

export type CompatReason = {
  level: "error" | "warning" | "unknown" | "info";
  message: string;
};

/**
 * Where the evidence came from. Source identification (e.g. CurseForge) is separate.
 * "manual" is unverified hand-entered data; "manual-verified" is a user-confirmed snapshot that
 * matches the active values; "stale" means the only evidence is for other values.
 */
export type Verification =
  "modrinth" | "jar" | "filename" | "manual" | "manual-verified" | "stale";
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
  /** The manual verification on record, current or not; shown as evidence. */
  evidence?: ManualVerification;
};

export const verificationLabels: Record<Verification, string> = {
  modrinth: "Modrinth",
  jar: "Local JAR",
  filename: "File name only",
  manual: "Manual",
  "manual-verified": "Manually verified",
  stale: "Needs reverification",
};

export const verificationSourceLabels: Record<
  ManualVerification["source"],
  string
> = {
  curseforge: "CurseForge",
  official: "Official Source",
  other: "Other Source",
};

// Manual entries and file-name guesses are never described as verified, and user-confirmed
// snapshots are always named as manual.
export function verificationText(result: CompatResult): string {
  switch (result.verification) {
    case "modrinth":
      return `Verified with ${verificationLabels.modrinth}`;
    case "jar":
      return `Verified with ${verificationLabels.jar}`;
    case "filename":
      return `${verificationLabels.filename} (not verified)`;
    case "manual":
      return "Entered manually (not verified)";
    case "manual-verified":
      return `Manually Verified via ${result.evidence ? verificationSourceLabels[result.evidence.source] : "Other Source"}`;
    case "stale":
      return "Needs Reverification";
  }
}

const loaderKey = (value: string) =>
  normalizeLoader(value) ?? value.trim().toLowerCase();
const sameSet = (a: string[], b: string[]) => {
  const left = new Set(a.map((value) => value.trim()));
  const right = new Set(b.map((value) => value.trim()));
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
};

/**
 * The Minecraft versions and modloaders the mod currently claims: entered values first, then
 * the linked Modrinth version, then the JAR's declared loaders. Same order as the editor's fields.
 */
export function activeSupport(mod: Mod): {
  gameVersions: string[];
  loaders: string[];
} {
  if (mod.manualCompatibility) return mod.manualCompatibility;
  const meta = mod.modrinth;
  if (meta?.versionId && meta.gameVersions && meta.loaders)
    return { gameVersions: meta.gameVersions, loaders: meta.loaders };
  const file = mod.file;
  if (file?.format && file.format !== "filename")
    return {
      gameVersions: [],
      loaders: file.loadersInferred ? [] : (file.loaders ?? []),
    };
  return { gameVersions: [], loaders: [] };
}

/** True when a manual verification exists and covers exactly the active version, Minecraft versions, and loaders. */
export function manualVerificationMatches(
  mod: Mod,
  support = activeSupport(mod),
): boolean {
  const snapshot = mod.manualVerification;
  return Boolean(
    snapshot &&
    snapshot.version.trim() === mod.version.trim() &&
    sameSet(snapshot.gameVersions, support.gameVersions) &&
    sameSet(snapshot.loaders.map(loaderKey), support.loaders.map(loaderKey)),
  );
}

/** Modrinth metadata describes the active version unless the Version field names another one. */
export function modrinthMatchesVersion(mod: Mod): boolean {
  const recorded = mod.modrinth?.versionNumber?.trim();
  const active = mod.version.trim();
  return !recorded || !active || recorded === active;
}

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
    const checkSupport = (
      subject: string,
      gameVersions: string[],
      loaders: string[],
    ) => {
      if (!minecraft)
        add(
          "minecraft",
          "unknown",
          "Set the pack's Minecraft version to check this mod.",
        );
      else if (!gameVersions.includes(minecraft))
        add(
          "minecraft",
          "error",
          `${subject} supports Minecraft ${summarizeVersions(gameVersions)}, not ${minecraft}.`,
        );

      if (!loader)
        add(
          "loader",
          "unknown",
          modpack.modloader.trim()
            ? `The pack modloader “${modpack.modloader}” is not recognized, so the loader cannot be checked.`
            : "Set the pack's modloader to check this mod.",
        );
      else if (!loaders.includes(loader)) {
        if (loader === "quilt" && loaders.includes("fabric"))
          add(
            "loader",
            "warning",
            `${subject} is for Fabric. Quilt usually loads Fabric mods, but this is not guaranteed.`,
          );
        else
          add(
            "loader",
            "error",
            `${subject} is for ${loaders.map(loaderName).join(", ") || "no listed loader"}, not ${loaderLabels[loader]}.`,
          );
      }
    };
    const checkModrinthDependencies = (dependencies: ModrinthDependency[]) => {
      sources.dependencies = "modrinth";
      for (const dependency of dependencies) {
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
    };
    const checkJarDependencies = (file: NonNullable<Mod["file"]>) => {
      sources.dependencies = "jar";
      for (const dependency of file.dependencies ?? []) {
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
    };
    const snapshot = mod.manualVerification;
    const manualMatch =
      snapshot && manualVerificationMatches(mod) ? snapshot : undefined;
    const modrinthCurrent = modrinthMatchesVersion(mod);
    let verification: Verification = facts ? "modrinth" : "manual";

    if (missing)
      add(
        null,
        "warning",
        "The selected Modrinth version was not found. It may have been deleted; choose another version.",
      );

    if (manualMatch) {
      // User-confirmed values for this exact version. Dependencies still come from the provider
      // data on record and are never treated as resolved by the confirmation.
      verification = "manual-verified";
      checkSupport(
        "The manually verified version",
        manualMatch.gameVersions,
        manualMatch.loaders.map(loaderKey),
      );
      if (facts) {
        if (!modrinthCurrent)
          add(
            null,
            "info",
            `Dependencies are from Modrinth version ${mod.modrinth?.versionNumber ?? "on record"}, not the manually verified ${manualMatch.version}.`,
          );
        checkModrinthDependencies(facts.dependencies);
      } else if (jar && jar.format !== "filename") checkJarDependencies(jar);
      else {
        sources.dependencies = "manual";
        checks.dependencies = "unknown";
        add(
          null,
          "info",
          "No Modrinth or JAR dependency data, so dependencies are not checked.",
        );
      }
    } else if (facts && modrinthCurrent) {
      checkSupport("Selected version", facts.gameVersions, facts.loaders);
      checkModrinthDependencies(facts.dependencies);
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

      checkJarDependencies(jar);
    } else if (snapshot || facts) {
      // Evidence exists, but for other values: the user changed the version or support.
      verification = "stale";
      add(
        null,
        "unknown",
        snapshot
          ? `Manually verified for version ${snapshot.version} with other Minecraft versions or modloaders. The active values changed, so verify again.`
          : `Version ${mod.version.trim()} is not the Modrinth version that was checked (${mod.modrinth?.versionNumber}). Verify it manually or pick it from Modrinth.`,
      );
      if (manualVersions.length) checkManualMinecraft();
      else checks.minecraft = "unknown";
      if (manualLoaders.length) checkManualLoader();
      else checks.loader = "unknown";
      if (facts) checkModrinthDependencies(facts.dependencies);
      else checks.dependencies = "unknown";
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

    if (snapshot && !manualMatch && verification !== "stale")
      add(
        null,
        "info",
        `An earlier manual verification (version ${snapshot.version}) no longer matches the active values and is kept as evidence only.`,
      );

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
      ...(snapshot && { evidence: snapshot }),
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
