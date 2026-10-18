import { uniqueId } from "./mods";
import type { Mod } from "./schema";

export const DEFAULT_CATEGORY = "Uncategorized";

/** Trimmed, single-spaced, case-insensitive form used only to spot duplicates. */
export function normalizeName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Name-only mods using the existing "unknown" conventions: empty version and URL, source
 * "Other", no Modrinth, JAR, or manual compatibility data. They stay Unknown until enriched.
 */
export function quickAddMods(
  names: string[],
  existing: Mod[],
  category = DEFAULT_CATEGORY,
): Mod[] {
  const created: Mod[] = [];
  for (const name of names) {
    created.push({
      id: uniqueId(name, [...existing, ...created]),
      name,
      version: "",
      category: category.trim() || DEFAULT_CATEGORY,
      tags: [],
      status: "planned",
      side: "both",
      source: "Other",
      sourceUrl: "",
      description: "",
      dependencies: [],
      notes: "",
      imageUrl: "",
    });
  }
  return created;
}
