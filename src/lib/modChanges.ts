import { manualVerificationMatches } from "./compatibility";
import type { Mod } from "./schema";

export type FieldChange = {
  field: string;
  label: string;
  from: string;
  to: string;
  /** True when a value the user already had is replaced (not just an empty field filled). */
  overwrites: boolean;
};

const fields: { key: keyof Mod; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "version", label: "Version" },
  { key: "category", label: "Category" },
  { key: "tags", label: "Tags" },
  { key: "status", label: "Status" },
  { key: "side", label: "Side" },
  { key: "source", label: "Source" },
  { key: "sourceUrl", label: "Source URL" },
  { key: "description", label: "Description" },
  { key: "dependencies", label: "Dependencies" },
  { key: "notes", label: "Notes" },
  { key: "imageUrl", label: "Image URL" },
];

function show(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" ? value : "";
}

/**
 * Field-level preview of applying `after` to `before`, for confirming metadata updates.
 * Linked Modrinth and JAR metadata are summarised rather than listed field by field.
 */
export function describeChanges(before: Mod, after: Mod): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const { key, label } of fields) {
    const from = show(before[key]);
    const to = show(after[key]);
    if (from !== to)
      changes.push({
        field: key,
        label,
        from,
        to,
        overwrites: from.trim() !== "",
      });
  }
  const link = (mod: Mod) =>
    mod.modrinth
      ? `${mod.modrinth.slug ?? mod.modrinth.projectId}${mod.modrinth.versionNumber ? ` ${mod.modrinth.versionNumber}` : ""}`
      : "";
  if (JSON.stringify(before.modrinth) !== JSON.stringify(after.modrinth))
    changes.push({
      field: "modrinth",
      label: "Modrinth link",
      from: link(before),
      to: link(after),
      overwrites: Boolean(before.modrinth),
    });
  const jar = (mod: Mod) =>
    mod.file
      ? `${mod.file.name}${mod.file.format ? ` (${mod.file.format})` : ""}`
      : "";
  if (JSON.stringify(before.file) !== JSON.stringify(after.file))
    changes.push({
      field: "file",
      label: "JAR metadata",
      from: jar(before),
      to: jar(after),
      overwrites: Boolean(before.file),
    });
  // The evidence is kept, but it stops applying; shown so the conflict is reviewed, not silent.
  const snapshot = before.manualVerification;
  if (
    snapshot &&
    manualVerificationMatches(before) &&
    !manualVerificationMatches(after)
  )
    changes.push({
      field: "manualVerification",
      label: "Manual verification",
      from: `Version ${snapshot.version} (verified by you)`,
      to: "Kept as evidence, but needs reverification",
      overwrites: true,
    });
  return changes;
}
