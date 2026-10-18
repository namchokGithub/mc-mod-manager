import type { DependencyLink, Mod } from "./schema";

/** A required or optional dependency from the provider data the checker reads. */
export type ListedDependency = {
  /** Modrinth project ID, or the JAR's loader mod ID. */
  id: string;
  name: string;
  kind: "required" | "optional";
  source: "modrinth" | "jar";
};

/** Same order as the compatibility checker: Modrinth version data first, then JAR metadata. */
export function listedDependencies(
  mod: Pick<Mod, "modrinth" | "file">,
): ListedDependency[] {
  const meta = mod.modrinth;
  if (meta?.versionId && meta.dependencies)
    return meta.dependencies.flatMap((dependency) =>
      dependency.projectId &&
      (dependency.type === "required" || dependency.type === "optional")
        ? [
            {
              id: dependency.projectId,
              name: dependency.name ?? dependency.projectId,
              kind: dependency.type,
              source: "modrinth" as const,
            },
          ]
        : [],
    );
  const file = mod.file;
  if (file?.format && file.format !== "filename")
    return (file.dependencies ?? []).flatMap((dependency) =>
      dependency.kind === "required" || dependency.kind === "optional"
        ? [
            {
              id: dependency.modId,
              name: dependency.modId,
              kind: dependency.kind,
              source: "jar" as const,
            },
          ]
        : [],
    );
  return [];
}

/** Lowercase letters and digits only: "Sophisticated Core", "sophisticated-core", and "sophisticatedcore" agree. */
export function matchKey(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** What the checker already matches without help: Modrinth project ID, or mod ID / JAR mod ID / slug. */
export function resolvedExactly(
  dependency: ListedDependency,
  self: Pick<Mod, "id">,
  mods: Mod[],
): boolean {
  return mods.some(
    (other) =>
      other.id !== self.id &&
      (dependency.source === "modrinth"
        ? other.modrinth?.projectId === dependency.id
        : [other.id, other.file?.modId, other.modrinth?.slug].includes(
            dependency.id,
          )),
  );
}

/**
 * Mods in the list that look like this dependency: the same ID, JAR mod ID, Modrinth slug, or
 * name once case, spaces, and punctuation are ignored.
 */
export function possibleProviders(
  dependency: ListedDependency,
  self: Pick<Mod, "id">,
  mods: Mod[],
): Mod[] {
  const wanted = new Set(
    [dependency.id, dependency.name].map(matchKey).filter(Boolean),
  );
  return mods.filter(
    (other) =>
      other.id !== self.id &&
      [other.id, other.file?.modId, other.modrinth?.slug, other.name].some(
        (value) => value !== undefined && wanted.has(matchKey(value)),
      ),
  );
}

export type LinkSuggestion = {
  dependency: ListedDependency;
  provider: Mod;
  /** The dependency is currently marked "not needed", although the list has it. */
  ignored: boolean;
};

/**
 * Dependencies the checker cannot match on its own but exactly one mod in the list provides.
 * Already linked or exactly matched dependencies are skipped. Never applied automatically.
 */
export function suggestDependencyLinks(
  mod: Mod,
  mods: Mod[],
): LinkSuggestion[] {
  const linked = new Set((mod.dependencyLinks ?? []).map((link) => link.id));
  const ignored = new Set(
    (mod.ignoredDependencies ?? []).map((entry) => entry.id),
  );
  return listedDependencies(mod).flatMap((dependency) => {
    if (linked.has(dependency.id) || resolvedExactly(dependency, mod, mods))
      return [];
    const providers = possibleProviders(dependency, mod, mods);
    const [provider] = providers;
    return providers.length === 1 && provider
      ? [{ dependency, provider, ignored: ignored.has(dependency.id) }]
      : [];
  });
}

/**
 * Adds links and removes "not needed" marks for the same dependencies, so a dependency is
 * either linked or ignored, never both.
 */
export function applyDependencyLinks(mod: Mod, links: DependencyLink[]): Mod {
  if (!links.length) return mod;
  const ids = new Set(links.map((link) => link.id));
  const dependencyLinks = [
    ...(mod.dependencyLinks ?? []).filter((link) => !ids.has(link.id)),
    ...links,
  ];
  const ignoredDependencies = (mod.ignoredDependencies ?? []).filter(
    (entry) => !ids.has(entry.id),
  );
  const { ignoredDependencies: _ignored, ...rest } = mod;
  void _ignored;
  return {
    ...rest,
    ...(ignoredDependencies.length && { ignoredDependencies }),
    dependencyLinks,
  };
}

/** Follows a mod ID change (renamed in the editor) in every other mod's dependency links. */
export function renameModInLinks(mods: Mod[], from: string, to: string): Mod[] {
  if (from === to) return mods;
  return mods.map((mod) =>
    mod.dependencyLinks?.some((link) => link.modId === from)
      ? {
          ...mod,
          dependencyLinks: mod.dependencyLinks.map((link) =>
            link.modId === from ? { ...link, modId: to } : link,
          ),
        }
      : mod,
  );
}
