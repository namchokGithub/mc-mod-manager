import { describe, expect, it } from "vitest";
import { withOrder } from "./batches";
import { buildGuide, defaultGuideOptions } from "./buildGuide";
import { groupMods } from "./grouping";
import { serializeJson } from "./json";
import { paginate } from "./pagination";
import { planningDashboard } from "./planningDashboard";
import { quickAddMods } from "./quickAdd";
import {
  packGroup,
  playerGroup,
  requiredByOthers,
  requirementCounts,
  requirementOf,
} from "./requirement";
import { collectionSchema, modSchema, parseJsonFile, type Mod } from "./schema";

const [base] = quickAddMods(["Base"], []);
const mod = (
  id: string,
  side: unknown,
  requirement?: Mod["requirement"],
  extra: Partial<Mod> = {},
) => ({ ...base!, id, name: id, side, requirement, ...extra }) as Mod;

const minimap = mod("minimap", "client");
const zoom = mod("zoom", "client", "optional");
const jei = mod("jei", "both");
const emotes = mod("emotes", "both", "optional");
const backup = mod("backup", "server", "optional");
const mystery = mod("mystery", "everywhere");
// Optional, but the required "create" depends on it by mod ID.
const flywheel = mod("flywheel", "client", "optional");
const create = mod("create", "both", undefined, { dependencies: ["flywheel"] });
const mods = [minimap, zoom, jei, emotes, backup, mystery, flywheel, create];
const requiredBy = requiredByOthers(mods);

describe("requirement", () => {
  it("defaults legacy mods to required and validates the field", () => {
    expect(requirementOf(minimap)).toBe("required");
    expect(requirementOf(zoom)).toBe("optional");
    const { requirement: _r, ...legacy } = minimap;
    void _r;
    expect(modSchema.safeParse(legacy).success).toBe(true);
    expect(
      modSchema.safeParse({ ...minimap, requirement: "maybe" }).success,
    ).toBe(false);
  });

  it("survives export and import, and legacy files still load", () => {
    const parsed = parseJsonFile(
      serializeJson([zoom, minimap]),
      "mods",
    ) as Mod[];
    expect(parsed[0]?.requirement).toBe("optional");
    expect(requirementOf(parsed[1]!)).toBe("required");
  });
});

describe("player groups", () => {
  const group = (item: Mod) => playerGroup(item, requiredBy)?.group ?? null;

  it("puts required client and both-side mods in Required for Players", () => {
    expect([group(minimap), group(jei), group(create)]).toEqual([
      "required",
      "required",
      "required",
    ]);
  });

  it("puts client-only optional mods in Optional for Players", () => {
    expect(group(zoom)).toBe("optional");
  });

  it("sends both-side optional and unknown-side mods to Needs Review", () => {
    expect(group(emotes)).toBe("review");
    expect(group(mystery)).toBe("review");
    expect(playerGroup(mystery, requiredBy)?.reason).toContain("unknown");
  });

  it("flags an optional mod that a required mod depends on", () => {
    expect(requiredBy.get("flywheel")).toEqual(["create"]);
    expect(playerGroup(flywheel, requiredBy)).toEqual({
      group: "review",
      reason: "Optional, but required by create.",
    });
    // A disabled dependent does not count.
    const off = requiredByOthers([flywheel, { ...create, status: "disabled" }]);
    expect(off.size).toBe(0);
  });

  it("leaves server-only mods out of the player groups", () => {
    expect(group(backup)).toBeNull();
    expect(packGroup(backup, requiredBy).group).toBe("optional");
  });
});

describe("grouping and pagination", () => {
  it("groups each mod once with counts, keeping order inside groups", () => {
    const players = mods.filter((item) => playerGroup(item, requiredBy));
    const { items, groups } = groupMods(players, "requirement", {
      players: true,
      requiredBy,
    });
    expect(groups).toEqual([
      { key: "required", label: "Required for Players", count: 3 },
      { key: "optional", label: "Optional for Players", count: 1 },
      { key: "review", label: "Needs Review", count: 3 },
    ]);
    expect(items.map((item) => item.mod.id)).toEqual([
      "minimap",
      "jei",
      "create",
      "zoom",
      "emotes",
      "mystery",
      "flywheel",
    ]);
    expect(new Set(items.map((item) => item.mod.id)).size).toBe(items.length);
  });

  it("groups by side and category, or not at all", () => {
    expect(
      groupMods(mods, "side", { players: false, requiredBy }).groups.map(
        (group) => `${group.label}:${group.count}`,
      ),
    ).toEqual(["Client Only:3", "Both Sides:3", "Server Only:1", "Unknown:1"]);
    expect(
      groupMods(mods, "none", { players: false, requiredBy }).groups,
    ).toEqual([]);
  });

  it("paginates the grouped list as one list", () => {
    const many = Array.from({ length: 75 }, (_, index) =>
      mod(`m${index}`, "client", index % 3 ? undefined : "optional"),
    );
    const { items } = groupMods(many, "requirement", {
      players: true,
      requiredBy: new Map(),
    });
    const second = paginate(items, 2, 50);
    expect(second).toMatchObject({ total: 75, from: 51, to: 75 });
    expect(second.items.every((item) => item.key === "optional")).toBe(true);
  });
});

describe("dashboard and guide", () => {
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
    mods: mods.filter((item) => item.id !== "mystery"),
    batches: withOrder([
      {
        id: "b",
        name: "Batch",
        description: "",
        order: 1,
        modIds: ["minimap", "zoom", "emotes", "flywheel", "create"],
        checklist: [],
      },
    ]),
  });

  it("counts requirements without changing other figures", () => {
    const dashboard = planningDashboard(collection);
    expect(dashboard.requirements).toEqual({
      required: 3,
      optional: 4,
      forPlayers: { required: 3, optional: 1, review: 2 },
    });
    expect(
      dashboard.requirements.required + dashboard.requirements.optional,
    ).toBe(dashboard.totalMods);
    expect(dashboard.sides.total).toBe(dashboard.totalMods);
    expect(requirementCounts([])).toEqual({
      required: 0,
      optional: 0,
      forPlayers: { required: 0, optional: 0, review: 0 },
    });
  });

  it("splits the guide into required, optional, and needs review", () => {
    const guide = buildGuide(collection, defaultGuideOptions);
    expect(guide).toContain("### Required mods");
    expect(guide).toContain("### Optional mods");
    expect(guide).toContain("### Needs review");
    expect(guide).toContain("Review: Optional, but required by create.");
    expect(guide).toContain("Leave one out only where");
    expect(guide.indexOf("### Required mods")).toBeLessThan(
      guide.indexOf("### Optional mods"),
    );
  });

  it("keeps the old layout when every mod is required", () => {
    const legacy = {
      ...collection,
      mods: collection.mods.map((item) => ({
        ...item,
        requirement: undefined,
      })),
    };
    const guide = buildGuide(legacy, defaultGuideOptions);
    expect(guide).toContain("### Mods");
    expect(guide).not.toContain("### Required mods");
  });
});
