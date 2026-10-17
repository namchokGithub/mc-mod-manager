import { uniqueId } from "./mods";
import type { Mod } from "./schema";

export const DEFAULT_CATEGORY = "Uncategorized";

/** Trimmed, single-spaced, case-insensitive form used only to spot duplicates. */
export function normalizeName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export type QuickAddLine = {
  name: string;
  /** "list": a mod with this name exists; "repeat": an earlier pasted line has it. */
  duplicate: null | "list" | "repeat";
  existingName?: string;
};

/** One name per line; blank lines are ignored. Nothing is created here. */
export function parseQuickAdd(text: string, existing: Mod[]): QuickAddLine[] {
  const byName = new Map(existing.map((mod) => [normalizeName(mod.name), mod]));
  const seen = new Set<string>();
  const lines: QuickAddLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = normalizeName(name);
    const match = byName.get(key);
    if (match)
      lines.push({ name, duplicate: "list", existingName: match.name });
    else if (seen.has(key)) lines.push({ name, duplicate: "repeat" });
    else lines.push({ name, duplicate: null });
    seen.add(key);
  }
  return lines;
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
