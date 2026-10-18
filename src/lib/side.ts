/**
 * Installation side views for presentation (Preview filter, Dashboard breakdown). Reads the
 * stored `side` only and never changes it; unrelated to compatibility checks.
 */
export type SideView = "players" | "server" | "all";
export type SideClass = "client" | "server" | "both" | "unknown";

export const sideViewLabels: Record<SideView, string> = {
  players: "For Players",
  server: "For Server",
  all: "All Mods",
};

export const sideClassLabels: Record<SideClass, string> = {
  client: "Client Only",
  server: "Server Only",
  both: "Both Sides",
  unknown: "Unknown",
};

/** The stored side, or "unknown" when it is missing or not one of the three values. Never "both". */
export function sideClass(mod: { side?: unknown }): SideClass {
  return mod.side === "client" || mod.side === "server" || mod.side === "both"
    ? mod.side
    : "unknown";
}

/** Players get client and both-side mods; the server gets server and both; Unknown only in All. */
export function matchesSideView(mod: { side?: unknown }, view: SideView) {
  if (view === "all") return true;
  const side = sideClass(mod);
  return view === "players"
    ? side === "client" || side === "both"
    : side === "server" || side === "both";
}

export type SideCounts = Record<SideClass, number> & {
  total: number;
  /** Client Only + Both Sides. Overlaps Server Pack through Both Sides. */
  clientPack: number;
  /** Server Only + Both Sides. */
  serverPack: number;
};

/** One pass over the mods; client + server + both + unknown always equals total. */
export function sideCounts(mods: { side?: unknown }[]): SideCounts {
  const counts = { client: 0, server: 0, both: 0, unknown: 0 };
  for (const mod of mods) counts[sideClass(mod)] += 1;
  return {
    ...counts,
    total: mods.length,
    clientPack: counts.client + counts.both,
    serverPack: counts.server + counts.both,
  };
}

/** How many mods each Preview view shows before search and other filters. */
export function sideViewCounts(counts: SideCounts): Record<SideView, number> {
  return {
    players: counts.clientPack,
    server: counts.serverPack,
    all: counts.total,
  };
}
