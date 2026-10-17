import { batchMods, orderedBatches, withOrder } from "./batches";
import {
  batchDependencyOverview,
  type DependencyEntry,
  type DependencySource,
} from "./dependencyOverview";
import type { Batch, Collection, Mod } from "./schema";

export type DependencyIssue = { mod: Mod; entry: DependencyEntry };
export type LaterIssue = DependencyIssue & { batch: Batch; position: number };

export type BatchSummary = {
  batch: Batch;
  position: number;
  modCount: number;
  missingRequired: number;
  unresolved: number;
  later: number;
  /** Mod IDs in this batch that are no longer in the mod list. */
  deletedRefs: string[];
};

export type PlanningDashboard = {
  totalMods: number;
  assignedMods: number;
  unassigned: Mod[];
  totalBatches: number;
  /** Unique assigned mods / total mods × 100, rounded; null when there are no mods. */
  coverage: number | null;
  health: {
    requiredResolved: number;
    requiredMissing: number;
    /** Required or optional dependencies that could not be matched reliably. */
    unresolved: number;
    optionalResolved: number;
    optionalMissing: number;
    /** Mods with no dependency metadata. Never counted as resolved. */
    unknownMods: number;
    /** How many mods' dependency lists came from each source. */
    sources: Record<DependencySource, number>;
  };
  batches: BatchSummary[];
  attention: {
    unassigned: Mod[];
    missing: DependencyIssue[];
    unresolved: DependencyIssue[];
    later: LaterIssue[];
    deletedRefs: { batch: Batch; position: number; ids: string[] }[];
  };
};

const ALL = "__planning-dashboard-all__";

/**
 * Derives the planning dashboard from the current collection (including unsaved edits).
 * Pure and read-only. A dependency relationship (mod + dependency) is counted once, however
 * many batches the mod is in.
 */
export function planningDashboard(collection: Collection): PlanningDashboard {
  const { mods } = collection;
  const batches = orderedBatches(collection.batches);
  const known = new Set(mods.map((mod) => mod.id));
  const assigned = new Set(
    batches.flatMap((batch) => batch.modIds.filter((id) => known.has(id))),
  );
  const unassigned = mods.filter((mod) => !assigned.has(mod.id));

  // Status does not depend on batches, so every mod is resolved once with the V2 logic by
  // putting the whole list in one temporary batch.
  const everything = batchDependencyOverview(
    ALL,
    withOrder([
      {
        id: ALL,
        name: "All mods",
        description: "",
        order: 1,
        modIds: mods.map((mod) => mod.id),
        checklist: [],
      },
    ]),
    mods,
  );
  const health: PlanningDashboard["health"] = {
    requiredResolved: 0,
    requiredMissing: 0,
    unresolved: 0,
    optionalResolved: 0,
    optionalMissing: 0,
    unknownMods: 0,
    sources: { modrinth: 0, jar: 0, manual: 0, unknown: 0 },
  };
  const missing: DependencyIssue[] = [];
  const unresolved: DependencyIssue[] = [];
  for (const { mod, source, entries } of everything.mods) {
    health.sources[source] += 1;
    if (source === "unknown") health.unknownMods += 1;
    for (const entry of entries) {
      if (entry.relation === "incompatible" || entry.relation === "discouraged")
        continue;
      if (entry.status === "unresolved") {
        health.unresolved += 1;
        unresolved.push({ mod, entry });
      } else if (entry.relation === "required") {
        if (entry.status === "resolved") health.requiredResolved += 1;
        else {
          health.requiredMissing += 1;
          missing.push({ mod, entry });
        }
      } else if (entry.status === "resolved") health.optionalResolved += 1;
      else health.optionalMissing += 1;
    }
  }

  const summaries: BatchSummary[] = [];
  const later: LaterIssue[] = [];
  const deletedRefs: PlanningDashboard["attention"]["deletedRefs"] = [];
  batches.forEach((batch, index) => {
    const position = index + 1;
    const { mods: present, missing: gone } = batchMods(batch, mods);
    const overview = batchDependencyOverview(
      batch.id,
      collection.batches,
      mods,
    );
    let missingRequired = 0;
    let unresolvedCount = 0;
    let laterCount = 0;
    for (const { mod, entries } of overview.mods)
      for (const entry of entries) {
        if (
          entry.relation === "incompatible" ||
          entry.relation === "discouraged"
        )
          continue;
        if (entry.status === "unresolved") unresolvedCount += 1;
        else if (entry.status === "missing" && entry.relation === "required")
          missingRequired += 1;
        if (entry.laterOnly) {
          laterCount += 1;
          later.push({ mod, entry, batch, position });
        }
      }
    if (gone.length) deletedRefs.push({ batch, position, ids: gone });
    summaries.push({
      batch,
      position,
      modCount: present.length,
      missingRequired,
      unresolved: unresolvedCount,
      later: laterCount,
      deletedRefs: gone,
    });
  });

  return {
    totalMods: mods.length,
    assignedMods: assigned.size,
    unassigned,
    totalBatches: batches.length,
    coverage: mods.length
      ? Math.round((assigned.size / mods.length) * 100)
      : null,
    health,
    batches: summaries,
    attention: {
      unassigned,
      missing,
      unresolved,
      later,
      deletedRefs,
    },
  };
}
