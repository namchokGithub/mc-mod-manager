import type { Mod } from "./schema";

/** How important a mod is to the pack, highest first. Separate from status and requirement. */
export const modPriorities = [
  "critical",
  "high",
  "normal",
  "low",
  "optional",
] as const;
export type ModPriority = (typeof modPriorities)[number];

export const priorityLabels: Record<ModPriority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
  optional: "Optional",
};

/** Missing means "normal"; older mods are never rewritten to add it. */
export function priorityOf(mod: Pick<Mod, "priority">): ModPriority {
  return mod.priority ?? "normal";
}

/** 0 for critical up to 4 for optional. */
export function priorityRank(mod: Pick<Mod, "priority">): number {
  return modPriorities.indexOf(priorityOf(mod));
}
