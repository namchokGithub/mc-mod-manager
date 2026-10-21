import { modIdsOf, orderedBatches } from "./batches";
import type { BatchFile, Mod } from "./schema";

export type DependencyRelation =
  "required" | "optional" | "incompatible" | "discouraged";
/** Where a mod's dependency list came from; "unknown" means there is none to read. */
export type DependencySource = "modrinth" | "jar" | "manual" | "unknown";
export type DependencyStatus = "resolved" | "missing" | "unresolved";
export type IdentifierKind = "modrinth-project" | "loader-mod-id" | "mod-id";

export type BatchRef = { id: string; name: string; position: number };

export type DependencyEntry = {
  /** Stable key: identifier kind + identifier (or label when there is no identifier). */
  key: string;
  relation: DependencyRelation;
  source: Exclude<DependencySource, "unknown">;
  label: string;
  identifier: string | null;
  identifierKind: IdentifierKind | null;
  status: DependencyStatus;
  /** Why it is missing or unresolved. */
  reason?: string;
  target?: Mod;
  /** Other batches the resolved target is assigned to, in plan order (excludes this batch). */
  batches: BatchRef[];
  inCurrentBatch: boolean;
  /** A required dependency that is only in batches after the current one. */
  laterOnly: boolean;
  /** Matched through a link the user confirmed (`dependencyLinks`), not by ID alone. */
  linked?: boolean;
};

export type ModDependencies = {
  mod: Mod;
  source: DependencySource;
  entries: DependencyEntry[];
};

export type DependencyCounts = {
  resolved: number;
  /** All required and optional dependencies that do not match a mod in the collection. */
  missing: number;
  /** Required dependencies that do not match a mod in the collection. */
  requiredMissing: number;
  /** Optional dependencies that are not present in the collection. */
  optionalMissing: number;
  unresolved: number;
  /** Mods in the batch with no dependency metadata at all. */
  unknown: number;
  /** Required dependencies that only appear in later batches. */
  later: number;
};

export type BatchDependencyOverview = {
  mods: ModDependencies[];
  counts: DependencyCounts;
};

export type CollectionDependencyLookup = {
  mod: Mod;
  source: DependencySource;
  dependencies: DependencyEntry[];
  usedBy: { mod: Mod; entry: DependencyEntry }[];
};

type RawDependency = {
  relation: DependencyRelation;
  identifier: string | null;
  identifierKind: IdentifierKind;
  name?: string;
};

export const relationLabels: Record<DependencyRelation, string> = {
  required: "Required",
  optional: "Optional",
  incompatible: "Incompatible",
  discouraged: "Discouraged",
};

export const sourceLabels: Record<DependencySource, string> = {
  modrinth: "Modrinth",
  jar: "Local JAR",
  manual: "Manual",
  unknown: "Unknown",
};

/**
 * Picks one dependency list per mod, by provenance: Modrinth version data, then JAR metadata,
 * then manual references. A mod with none is "unknown", never "no dependencies".
 */
function readDependencies(mod: Mod): {
  source: DependencySource;
  dependencies: RawDependency[];
} {
  const read = readAllDependencies(mod);
  const ignored = new Set(
    (mod.ignoredDependencies ?? []).map((entry) => entry.id),
  );
  if (!ignored.size) return read;
  // Requirements the user marked as not needed for this pack are left out; conflicts stay.
  return {
    ...read,
    dependencies: read.dependencies.filter(
      (dependency) =>
        !(
          dependency.identifier &&
          ignored.has(dependency.identifier) &&
          (dependency.relation === "required" ||
            dependency.relation === "optional")
        ),
    ),
  };
}

function readAllDependencies(mod: Mod): {
  source: DependencySource;
  dependencies: RawDependency[];
} {
  const meta = mod.modrinth;
  if (meta?.versionId && meta.dependencies)
    return {
      source: "modrinth",
      dependencies: meta.dependencies.flatMap((dependency) =>
        // Embedded dependencies ship inside the mod and need no separate install.
        dependency.type === "embedded"
          ? []
          : [
              {
                relation: dependency.type,
                identifier: dependency.projectId,
                identifierKind: "modrinth-project" as const,
                name: dependency.name,
              },
            ],
      ),
    };
  const file = mod.file;
  if (file?.format && file.format !== "filename")
    return {
      source: "jar",
      dependencies: (file.dependencies ?? []).map((dependency) => ({
        relation: dependency.kind,
        identifier: dependency.modId,
        identifierKind: "loader-mod-id" as const,
      })),
    };
  if (mod.dependencies.length)
    return {
      source: "manual",
      // The free-text field is only trusted where an entry is exactly another mod's ID.
      dependencies: mod.dependencies.map((entry) => ({
        relation: "required" as const,
        identifier: entry,
        identifierKind: "mod-id" as const,
      })),
    };
  return { source: "unknown", dependencies: [] };
}

function identifierOf(mod: Mod, kind: IdentifierKind): string | undefined {
  if (kind === "modrinth-project") return mod.modrinth?.projectId;
  if (kind === "loader-mod-id") return mod.file?.modId;
  return mod.id;
}

const STRENGTH: Record<DependencyRelation, number> = {
  required: 3,
  incompatible: 2,
  discouraged: 1,
  optional: 0,
};

/** Dependency overview for one batch; read-only and never moves or changes mods. */
export function batchDependencyOverview(
  batchId: string,
  plan: BatchFile,
  mods: Mod[],
): BatchDependencyOverview {
  const batches = orderedBatches(plan);
  const position = batches.findIndex((batch) => batch.id === batchId) + 1;
  const current = batches[position - 1];
  const counts: DependencyCounts = {
    resolved: 0,
    missing: 0,
    requiredMissing: 0,
    optionalMissing: 0,
    unresolved: 0,
    unknown: 0,
    later: 0,
  };
  if (!current) return { mods: [], counts };

  const byId = new Map(mods.map((mod) => [mod.id, mod]));
  const batchesOf = (modId: string): BatchRef[] =>
    batches.flatMap((batch, index) =>
      modIdsOf(batch).includes(modId)
        ? [{ id: batch.id, name: batch.name, position: index + 1 }]
        : [],
    );

  const result: ModDependencies[] = [];
  for (const modId of modIdsOf(current)) {
    const mod = byId.get(modId);
    if (!mod) continue;
    const { source, dependencies } = readDependencies(mod);
    if (source === "unknown") {
      counts.unknown += 1;
      result.push({ mod, source, entries: [] });
      continue;
    }
    const entries = new Map<string, DependencyEntry>();
    const links = new Map(
      (mod.dependencyLinks ?? []).map((link) => [link.id, link.modId]),
    );
    for (const dependency of dependencies) {
      const own = identifierOf(mod, dependency.identifierKind);
      if (dependency.identifier && own === dependency.identifier) continue; // self-reference
      const key = `${dependency.identifierKind}:${dependency.identifier ?? dependency.name ?? "?"}`;
      const previous = entries.get(key);
      // Listed twice: keep the stronger relation (required beats optional).
      if (
        previous &&
        STRENGTH[previous.relation] >= STRENGTH[dependency.relation]
      )
        continue;

      const linkedId =
        dependency.identifier && dependency.identifierKind !== "mod-id"
          ? links.get(dependency.identifier)
          : undefined;
      const matches =
        linkedId !== undefined
          ? mods.filter((other) => other.id !== mod.id && other.id === linkedId)
          : dependency.identifier
            ? mods.filter(
                (other) =>
                  other.id !== mod.id &&
                  identifierOf(other, dependency.identifierKind) ===
                    dependency.identifier,
              )
            : [];
      const target = matches.length === 1 ? matches[0] : undefined;
      let status: DependencyStatus = "resolved";
      let reason: string | undefined;
      if (!dependency.identifier) {
        status = "unresolved";
        reason = "The metadata gives no project ID, so it cannot be matched.";
      } else if (matches.length > 1) {
        status = "unresolved";
        reason = `${matches.length} mods share this ID (${matches.map((other) => other.name).join(", ")}).`;
      } else if (!target && linkedId !== undefined) {
        status = "missing";
        reason = `Linked to “${linkedId}”, which is no longer in the mod list.`;
      } else if (!target) {
        if (dependency.identifierKind === "mod-id") {
          status = "unresolved";
          reason =
            "Entered manually and not an exact mod ID in the list, so it is not matched by name.";
        } else {
          status = "missing";
          reason =
            dependency.identifierKind === "modrinth-project"
              ? "No mod in the list is linked to this Modrinth project."
              : "No mod in the list was imported with this loader mod ID.";
        }
      }
      const targetBatches = target ? batchesOf(target.id) : [];
      const inCurrentBatch = targetBatches.some(
        (batch) => batch.id === current.id,
      );
      const otherBatches = targetBatches.filter(
        (batch) => batch.id !== current.id,
      );
      const laterOnly =
        dependency.relation === "required" &&
        !inCurrentBatch &&
        otherBatches.length > 0 &&
        otherBatches.every((batch) => batch.position > position);
      entries.set(key, {
        key,
        relation: dependency.relation,
        source,
        label:
          target?.name ??
          dependency.name ??
          dependency.identifier ??
          "Unknown project",
        identifier: dependency.identifier,
        identifierKind: dependency.identifierKind,
        status,
        reason,
        target,
        batches: otherBatches,
        inCurrentBatch,
        laterOnly,
        ...(linkedId !== undefined && target && { linked: true }),
      });
    }
    const list = [...entries.values()];
    for (const entry of list) {
      if (entry.relation === "incompatible" || entry.relation === "discouraged")
        continue;
      counts[entry.status] += 1;
      if (entry.status === "missing") {
        if (entry.relation === "optional") counts.optionalMissing += 1;
        else counts.requiredMissing += 1;
      }
      if (entry.laterOnly) counts.later += 1;
    }
    result.push({ mod, source, entries: list });
  }
  return { mods: result, counts };
}

/** Uses the same ID-based matching as the batch view across the whole mod collection. */
export function collectionDependencyLookup(
  modId: string,
  mods: Mod[],
): CollectionDependencyLookup | undefined {
  const overview = batchDependencyOverview(
    "collection-lookup",
    {
      version: 2,
      batches: [
        {
          id: "collection-lookup",
          name: "Collection",
          description: "",
          order: 1,
          steps: [
            {
              id: "all-mods",
              name: "All mods",
              description: "",
              done: false,
              itemRefs: mods.map((mod) => ({
                type: "mod" as const,
                id: mod.id,
              })),
            },
          ],
        },
      ],
    },
    mods,
  );
  const selected = overview.mods.find(({ mod }) => mod.id === modId);
  if (!selected) return undefined;
  return {
    mod: selected.mod,
    source: selected.source,
    dependencies: selected.entries,
    usedBy: overview.mods.flatMap(({ mod, entries }) =>
      entries.flatMap((entry) =>
        entry.target?.id === modId &&
        (entry.relation === "required" || entry.relation === "optional")
          ? [{ mod, entry }]
          : [],
      ),
    ),
  };
}

/** Short, human-readable location of a resolved dependency. */
export function placementText(entry: DependencyEntry): string {
  if (entry.status !== "resolved") return "";
  const names = entry.batches
    .map((batch) => `Batch ${batch.position} (${batch.name})`)
    .join(", ");
  if (entry.inCurrentBatch)
    return names ? `In this batch and ${names}` : "In this batch";
  return names ? `In ${names}` : "In the mod list, not in any batch";
}
