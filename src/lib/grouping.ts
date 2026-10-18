import {
  packGroup,
  packGroupLabels,
  playerGroup,
  playerGroupLabels,
  type RequirementGroup,
} from "./requirement";
import type { Mod } from "./schema";
import { sideClass, sideClassLabels, type SideClass } from "./side";

export type GroupBy = "none" | "category" | "side" | "requirement";

export const groupByLabels: Record<GroupBy, string> = {
  none: "None",
  category: "Category",
  side: "Installation Side",
  requirement: "Installation Requirement",
};

export type GroupedItem = {
  mod: Mod;
  /** Group key; "" when not grouped. */
  key: string;
  /** Why a mod needs review, when it does. */
  reason?: string;
};

export type ModGroup = { key: string; label: string; count: number };

const sideOrder: SideClass[] = ["client", "both", "server", "unknown"];
const requirementOrder: RequirementGroup[] = ["required", "optional", "review"];

/**
 * Orders already filtered and sorted mods by group, keeping their order inside each group, so
 * pagination stays a plain slice and every mod appears once. In the For Players view the
 * requirement groups are the player groups (Required / Optional for Players / Needs Review).
 */
export function groupMods(
  mods: Mod[],
  by: GroupBy,
  context: { players: boolean; requiredBy: ReadonlyMap<string, string[]> },
): { items: GroupedItem[]; groups: ModGroup[] } {
  if (by === "none")
    return { items: mods.map((mod) => ({ mod, key: "" })), groups: [] };
  const describe = (mod: Mod): GroupedItem => {
    if (by === "category") return { mod, key: mod.category };
    if (by === "side") return { mod, key: sideClass(mod) };
    const grouped = context.players
      ? playerGroup(mod, context.requiredBy)
      : packGroup(mod, context.requiredBy);
    return {
      mod,
      key: grouped?.group ?? "review",
      ...(grouped?.reason && { reason: grouped.reason }),
    };
  };
  const described = mods.map(describe);
  const label = (key: string) =>
    by === "side"
      ? sideClassLabels[key as SideClass]
      : by === "requirement"
        ? (context.players ? playerGroupLabels : packGroupLabels)[
            key as RequirementGroup
          ]
        : key;
  const keys = [...new Set(described.map((item) => item.key))];
  const rank = (key: string) =>
    by === "side"
      ? sideOrder.indexOf(key as SideClass)
      : by === "requirement"
        ? requirementOrder.indexOf(key as RequirementGroup)
        : 0;
  keys.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const order = new Map(keys.map((key, index) => [key, index]));
  const items = described
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        order.get(a.item.key)! - order.get(b.item.key)! || a.index - b.index,
    )
    .map(({ item }) => item);
  const counts = new Map<string, number>();
  for (const item of items)
    counts.set(item.key, (counts.get(item.key) ?? 0) + 1);
  return {
    items,
    groups: keys.map((key) => ({
      key,
      label: label(key),
      count: counts.get(key) ?? 0,
    })),
  };
}
