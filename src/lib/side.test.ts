import { describe, expect, it } from "vitest";
import { withOrder } from "./batches";
import { filterMods, type Filters } from "./mods";
import { paginate } from "./pagination";
import { planningDashboard } from "./planningDashboard";
import { quickAddMods } from "./quickAdd";
import { collectionSchema, type Mod } from "./schema";
import {
  matchesSideView,
  sideClass,
  sideCounts,
  sideViewCounts,
  type SideView,
} from "./side";

const [base] = quickAddMods(["Base"], []);
const mod = (id: string, side: unknown, status: Mod["status"] = "planned") =>
  ({ ...base!, id, name: id, side, status }) as Mod;
// An invalid stored side, as an old or hand-edited file might have.
const mods = [
  mod("minimap", "client"),
  mod("jei", "both"),
  mod("backup", "server"),
  mod("broken", "everywhere"),
  mod("missing", undefined),
  mod("old", "both", "removed"),
];
const ids = (view: SideView) =>
  mods.filter((item) => matchesSideView(item, view)).map((item) => item.id);

describe("side classification", () => {
  it("keeps stored values and turns missing or invalid ones into Unknown, never Both", () => {
    expect(mods.map(sideClass)).toEqual([
      "client",
      "both",
      "server",
      "unknown",
      "unknown",
      "both",
    ]);
  });

  it("For Players: client and both, without server or unknown", () => {
    expect(ids("players")).toEqual(["minimap", "jei", "old"]);
  });

  it("For Server: server only, without client, both, or unknown", () => {
    expect(ids("server")).toEqual(["backup"]);
  });

  it("All Mods: every classification", () => {
    expect(ids("all")).toEqual(mods.map((item) => item.id));
  });

  it("never changes the mods", () => {
    const before = JSON.stringify(mods);
    sideCounts(mods);
    ids("players");
    expect(JSON.stringify(mods)).toBe(before);
  });
});

describe("counts", () => {
  const counts = sideCounts(mods);

  it("sum to the total, with overlapping packs", () => {
    expect(counts).toEqual({
      client: 1,
      server: 1,
      both: 2,
      unknown: 2,
      total: 6,
      clientPack: 3,
      serverPack: 3,
    });
    expect(counts.client + counts.server + counts.both + counts.unknown).toBe(
      counts.total,
    );
    expect(counts.clientPack).toBe(counts.client + counts.both);
    expect(counts.serverPack).toBe(counts.server + counts.both);
  });

  it("match what each Preview view lists", () => {
    expect(sideViewCounts(counts)).toEqual({
      players: ids("players").length,
      server: ids("server").length,
      all: mods.length,
    });
  });

  it("handle an empty collection", () => {
    expect(sideCounts([])).toEqual({
      client: 0,
      server: 0,
      both: 0,
      unknown: 0,
      total: 0,
      clientPack: 0,
      serverPack: 0,
    });
  });
});

describe("Preview pagination", () => {
  const many = Array.from({ length: 120 }, (_, index) =>
    mod(
      `m${String(index).padStart(3, "0")}`,
      index < 100 ? "client" : "server",
    ),
  );
  const filters: Filters = {
    query: "",
    category: "",
    status: "",
    side: "",
    sort: "az",
  };
  const view = (side: SideView, page: number) =>
    paginate(
      filterMods(
        many.filter((item) => matchesSideView(item, side)),
        filters,
      ),
      page,
      50,
    );

  it("filters before paginating and clamps a page that no longer exists", () => {
    expect(view("players", 2)).toMatchObject({ total: 100, pageCount: 2 });
    const server = view("server", 2);
    expect(server).toMatchObject({ total: 20, page: 1, pageCount: 1 });
    expect(server.items).toHaveLength(20);
  });
});

describe("dashboard", () => {
  const collection = collectionSchema.parse({
    modpack: {
      name: "P",
      description: "",
      version: "",
      minecraftVersion: "26.1.2",
      modloader: "NeoForge",
      modloaderVersion: "",
      author: "",
      updatedAt: "2026-10-18",
      heroImageUrl: "",
    },
    mods: mods.filter((item) => sideClass(item) !== "unknown"),
    batches: withOrder([]),
  });
  const dashboard = planningDashboard(collection);

  it("breaks down the same mods as Total Mods, every status", () => {
    expect(dashboard.totalMods).toBe(4);
    expect(dashboard.sides).toMatchObject({
      total: 4,
      client: 1,
      server: 1,
      both: 2,
      unknown: 0,
    });
  });

  it("leaves the other figures unchanged", () => {
    const { sides: _sides, ...rest } = dashboard;
    void _sides;
    expect(rest.totalMods).toBe(collection.mods.length);
    expect(rest.coverage).toBe(0);
    expect(rest.unassigned).toHaveLength(4);
  });
});
