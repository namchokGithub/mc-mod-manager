import type { Mod } from "./schema";

export type Filters = {
  query: string;
  category: string;
  status: string;
  side: string;
  sort: "az" | "za";
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
        (!filters.side || mod.side === filters.side)
      );
    })
    .sort((a, b) =>
      filters.sort === "az"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name),
    );
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

/** Removes every mod whose ID is listed, in one pass; unknown IDs are ignored. */
export function removeMods(mods: Mod[], ids: Iterable<string>): Mod[] {
  const remove = new Set(ids);
  return mods.filter((mod) => !remove.has(mod.id));
}
