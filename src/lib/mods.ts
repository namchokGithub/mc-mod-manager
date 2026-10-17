import type { Mod } from "./schema";

export type Filters = {
  query: string;
  category: string;
  status: string;
  side: string;
  sort: "az" | "za";
};

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

export function uniqueId(name: string, mods: Mod[]): string {
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
