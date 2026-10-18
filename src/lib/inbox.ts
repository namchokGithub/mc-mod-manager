import { uniqueId } from "./mods";
import { normalizeName, quickAddMods, DEFAULT_CATEGORY } from "./quickAdd";
import type { InboxEntry, Mod } from "./schema";

/** Inbox entries for new names; IDs are unique within the inbox and never change. */
export function inboxEntriesFromNames(
  names: string[],
  existing: InboxEntry[],
  now = new Date(),
): InboxEntry[] {
  const created: InboxEntry[] = [];
  for (const name of names)
    created.push({
      id: uniqueId(name, [...existing, ...created]),
      name,
      notes: "",
      createdAt: now.toISOString(),
    });
  return created;
}

/**
 * Adds one typed name to the inbox (Mod Inbox "Add Row"). Empty names and names already in the
 * inbox are refused, so nothing blank or accidentally repeated is stored. Never touches mods.
 */
export function addInboxEntry(
  entries: InboxEntry[],
  input: { name: string; notes: string },
  now = new Date(),
):
  | { ok: true; entries: InboxEntry[]; entry: InboxEntry }
  | { ok: false; error: string } {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Enter a mod name." };
  const key = normalizeName(name);
  const existing = entries.find((entry) => normalizeName(entry.name) === key);
  if (existing)
    return { ok: false, error: `Already in the inbox as “${existing.name}”.` };
  const [created] = inboxEntriesFromNames([name], entries, now);
  const entry = { ...created!, notes: input.notes.trim() };
  return { ok: true, entries: [...entries, entry], entry };
}

/** The collection mod with the same normalized name, if any. */
export function collectionMatch(
  entry: { name: string },
  mods: Mod[],
): Mod | undefined {
  const key = normalizeName(entry.name);
  return mods.find((mod) => normalizeName(mod.name) === key);
}

/** IDs of entries whose name repeats an earlier inbox entry. */
export function inboxRepeats(entries: InboxEntry[]): Set<string> {
  const seen = new Set<string>();
  const repeats = new Set<string>();
  for (const entry of entries) {
    const key = normalizeName(entry.name);
    if (seen.has(key)) repeats.add(entry.id);
    seen.add(key);
  }
  return repeats;
}

export type Promotion = {
  created: Mod[];
  /** Inbox entries that became mods; only these may be removed from the inbox. */
  promotedIds: string[];
  /** Entries left in the inbox because the collection (or this promotion) already has the name. */
  skipped: { entry: InboxEntry; existingName: string }[];
};

/**
 * Plans adding selected inbox entries to the collection with the existing Quick Add mod
 * defaults (Planned, unknown metadata). Pure: it never overwrites or removes anything.
 */
export function promoteInbox(
  entries: InboxEntry[],
  selectedIds: Iterable<string>,
  mods: Mod[],
  category = DEFAULT_CATEGORY,
): Promotion {
  const selected = new Set(selectedIds);
  const created: Mod[] = [];
  const promotedIds: string[] = [];
  const skipped: Promotion["skipped"] = [];
  for (const entry of entries) {
    if (!selected.has(entry.id)) continue;
    const existing = collectionMatch(entry, [...mods, ...created]);
    if (existing) {
      skipped.push({ entry, existingName: existing.name });
      continue;
    }
    const [mod] = quickAddMods([entry.name], [...mods, ...created], category);
    if (!mod) continue;
    created.push({ ...mod, notes: entry.notes.trim() });
    promotedIds.push(entry.id);
  }
  return { created, promotedIds, skipped };
}
