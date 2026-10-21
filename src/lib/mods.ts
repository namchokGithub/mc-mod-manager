import { priorityOf, priorityRank } from "./priority";
import type { Mod } from "./schema";

export type Filters = {
  query: string;
  category: string;
  status: string;
  side: string;
  /** A priority value, or "" for all. Optional so older callers keep working. */
  priority?: string;
  /** Name A–Z / Z–A, by `addedAt` newest / oldest first, or by priority. */
  sort:
    "az" | "za" | "added-desc" | "added-asc" | "priority-desc" | "priority-asc";
};

/**
 * Gives every mod without `addedAt` the same timestamp. Existing values are kept, and the same
 * array is returned when nothing is missing, so callers can tell whether anything changed.
 */
export function withAddedAt(mods: Mod[], now: Date): Mod[] {
  if (mods.every((mod) => mod.addedAt)) return mods;
  const at = now.toISOString();
  return mods.map((mod) => (mod.addedAt ? mod : { ...mod, addedAt: at }));
}

/**
 * The mod to store from the editor. A new mod gets `now`; an edited mod keeps the `addedAt` it
 * already had, whatever the form sent.
 */
export function stampSavedMod(
  mod: Mod,
  previous: Mod | undefined,
  now: Date,
): Mod {
  const addedAt = previous
    ? (previous.addedAt ?? mod.addedAt ?? now.toISOString())
    : now.toISOString();
  return { ...mod, addedAt };
}

export type MinimalMod = {
  name: string;
  category: string;
  side: Mod["side"];
  /** Lowercase source, e.g. "modrinth" or "curseforge". */
  source: string;
  /** The mod's source URL; "" when it has none. */
  url: string;
};

/** A short list for sharing: name, category, side, source, and URL only, in collection order. */
export function minimalModList(mods: Mod[]): MinimalMod[] {
  return mods.map((mod) => ({
    name: mod.name,
    category: mod.category,
    side: mod.side,
    source: mod.source.toLowerCase(),
    url: mod.sourceUrl,
  }));
}

/** Normalizes search text so punctuation variants do not hide matching mod names. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u2018\u2019\u02bc']/g, "")
    .replace(/\p{M}/gu, "")
    .replace(/[\p{P}\p{S}_]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Case- and punctuation-insensitive substring matching for a mod name. */
export function matchesSearchText(value: string, query: string): boolean {
  const needle = normalizeSearchText(query);
  return !needle || normalizeSearchText(value).includes(needle);
}

export function filterMods(mods: Mod[], filters: Filters): Mod[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return mods
    .filter((mod) => {
      const matchesQuery =
        !query ||
        `${mod.name} ${mod.description}`.toLocaleLowerCase().includes(query);
      return (
        matchesQuery &&
        (!filters.category || mod.category === filters.category) &&
        (!filters.status || mod.status === filters.status) &&
        (!filters.side || mod.side === filters.side) &&
        (!filters.priority || priorityOf(mod) === filters.priority)
      );
    })
    .sort((a, b) => {
      if (filters.sort === "priority-desc" || filters.sort === "priority-asc") {
        // Missing counts as normal; equal priorities fall back to name.
        const byPriority =
          filters.sort === "priority-desc"
            ? priorityRank(a) - priorityRank(b)
            : priorityRank(b) - priorityRank(a);
        return byPriority || a.name.localeCompare(b.name);
      }
      if (filters.sort === "added-desc" || filters.sort === "added-asc") {
        // Mods without a date go last either way; equal dates fall back to name.
        const at = (mod: Mod) => (mod.addedAt ? Date.parse(mod.addedAt) : NaN);
        const left = at(a);
        const right = at(b);
        if (Number.isNaN(left) !== Number.isNaN(right))
          return Number.isNaN(left) ? 1 : -1;
        const byDate =
          Number.isNaN(left) || left === right
            ? 0
            : filters.sort === "added-desc"
              ? right - left
              : left - right;
        return byDate || a.name.localeCompare(b.name);
      }
      return filters.sort === "az"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    });
}

export function uniqueId(name: string, mods: { id: string }[]): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "mod";
  const ids = new Set(mods.map((mod) => mod.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

/** Copy editable details without carrying the original mod's project or file identity. */
export function duplicateMod(mod: Mod, existing: Mod[]): Mod {
  return {
    ...mod,
    id: uniqueId(mod.name, existing),
    name: `${mod.name} (copy)`,
    status: "planned",
    version: "",
    sourceUrl: "",
    imageUrl: "",
    dependencies: [],
    modrinth: undefined,
    file: undefined,
    manualCompatibility: undefined,
    manualVerification: undefined,
    ignoredDependencies: undefined,
    dependencyLinks: undefined,
    addedAt: undefined,
  };
}

/** Removes every mod whose ID is listed, in one pass; unknown IDs are ignored. */
export function removeMods(mods: Mod[], ids: Iterable<string>): Mod[] {
  const remove = new Set(ids);
  return mods.filter((mod) => !remove.has(mod.id));
}
