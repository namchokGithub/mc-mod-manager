import { withOrder } from "./batches";
import { isActive } from "./compatibility";
import { batchDependencyOverview } from "./dependencyOverview";
import type { Mod } from "./schema";
import { sideClass } from "./side";

/**
 * Installation requirement: modpack policy, not compatibility. Missing means required. Optional
 * never means compatible, dependency-free, or safe to skip on its own.
 */
export type Requirement = "required" | "optional";

export function requirementOf(mod: Pick<Mod, "requirement">): Requirement {
  return mod.requirement === "optional" ? "optional" : "required";
}

export const requirementLabels: Record<Requirement, string> = {
  required: "Required",
  optional: "Optional",
};

export const requirementHints: Record<Requirement, string> = {
  required: "Expected to be installed for the applicable side.",
  optional:
    "Can be omitted only where the modpack configuration and dependencies permit.",
};

const ALL = "__requirement-all__";

/**
 * Optional mods that an active, required mod needs, with those mods' names. Uses the existing
 * dependency matching (one level, no recursion); only resolved required dependencies count.
 */
export function requiredByOthers(mods: Mod[]): Map<string, string[]> {
  const overview = batchDependencyOverview(
    ALL,
    withOrder([
      {
        id: ALL,
        name: "All",
        description: "",
        order: 1,
        modIds: mods.map((mod) => mod.id),
        checklist: [],
      },
    ]),
    mods,
  );
  const needed = new Map<string, string[]>();
  for (const { mod, entries } of overview.mods) {
    if (requirementOf(mod) !== "required" || !isActive(mod)) continue;
    for (const entry of entries)
      if (
        entry.relation === "required" &&
        entry.status === "resolved" &&
        entry.target &&
        requirementOf(entry.target) === "optional"
      )
        needed.set(entry.target.id, [
          ...(needed.get(entry.target.id) ?? []),
          mod.name,
        ]);
  }
  return needed;
}

export type RequirementGroup = "required" | "optional" | "review";

export const playerGroupLabels: Record<RequirementGroup, string> = {
  required: "Required for Players",
  optional: "Optional for Players",
  review: "Needs Review",
};

export const packGroupLabels: Record<RequirementGroup, string> = {
  required: "Required mods",
  optional: "Optional mods",
  review: "Needs review",
};

export type Grouped = { group: RequirementGroup; reason?: string };

const neededBy = (names: string[]) =>
  `Optional, but required by ${names.join(", ")}.`;

/**
 * Where a mod goes for a player installing the client, or null when players do not install it
 * (server only). Unknown sides, both-side optional mods (the client/server split is unclear),
 * and optional mods a required mod depends on all need review.
 */
export function playerGroup(
  mod: Mod,
  requiredBy: ReadonlyMap<string, string[]>,
): Grouped | null {
  const side = sideClass(mod);
  if (side === "server") return null;
  if (side === "unknown")
    return { group: "review", reason: "Installation side is unknown." };
  if (requirementOf(mod) === "required") return { group: "required" };
  const names = requiredBy.get(mod.id);
  if (names) return { group: "review", reason: neededBy(names) };
  if (side === "both")
    return {
      group: "review",
      reason:
        "Optional on both sides: check whether the client can leave it out.",
    };
  return { group: "optional" };
}

/** The same rules for the whole pack (Build Guide): a side being unknown alone is not a review. */
export function packGroup(
  mod: Mod,
  requiredBy: ReadonlyMap<string, string[]>,
): Grouped {
  if (requirementOf(mod) === "required") return { group: "required" };
  const names = requiredBy.get(mod.id);
  if (names) return { group: "review", reason: neededBy(names) };
  const side = sideClass(mod);
  if (side === "both" || side === "unknown")
    return {
      group: "review",
      reason:
        side === "both"
          ? "Optional on both sides: check which side can leave it out."
          : "Optional, and its installation side is unknown.",
    };
  return { group: "optional" };
}

export type RequirementCounts = {
  required: number;
  optional: number;
  forPlayers: Record<RequirementGroup, number>;
};

/** Required + optional = all mods; the player groups cover every mod players see, once each. */
export function requirementCounts(mods: Mod[]): RequirementCounts {
  const requiredBy = requiredByOthers(mods);
  const counts: RequirementCounts = {
    required: 0,
    optional: 0,
    forPlayers: { required: 0, optional: 0, review: 0 },
  };
  for (const mod of mods) {
    counts[requirementOf(mod)] += 1;
    const grouped = playerGroup(mod, requiredBy);
    if (grouped) counts.forPlayers[grouped.group] += 1;
  }
  return counts;
}
