import { describe, expect, it } from "vitest";
import { withOrder } from "./batches";
import { planningDashboard } from "./planningDashboard";
import { emptyContent, type Batch, type Collection, type Mod } from "./schema";

function mod(id: string, extra: Partial<Mod> = {}): Mod {
  return {
    id,
    name: id.toUpperCase(),
    version: "",
    category: "c",
    tags: [],
    status: "planned",
    side: "both",
    source: "Modrinth",
    sourceUrl: "",
    description: "",
    dependencies: [],
    notes: "",
    imageUrl: "",
    ...extra,
  };
}

const linked = (
  id: string,
  dependencies: NonNullable<NonNullable<Mod["modrinth"]>["dependencies"]> = [],
) =>
  mod(id, {
    modrinth: { projectId: `p-${id}`, versionId: `v-${id}`, dependencies },
  });

const dep = (
  projectId: string | null,
  type: "required" | "optional" = "required",
) => ({ projectId, versionId: null, type });

const batch = (id: string, modIds: string[]): Batch => ({
  id,
  name: id,
  description: "",
  order: 1,
  steps: [
    {
      id: "install",
      name: "Install",
      description: "",
      done: false,
      itemRefs: modIds.map((id) => ({ type: "mod" as const, id })),
    },
  ],
});

function collection(mods: Mod[], batches: Batch[]): Collection {
  return {
    ...emptyContent(),
    modpack: {
      name: "Pack",
      description: "",
      version: "",
      minecraftVersion: "26.1.2",
      modloader: "NeoForge",
      modloaderVersion: "",
      author: "",
      updatedAt: "2026-10-17",
      heroImageUrl: "",
    },
    mods,
    batches: withOrder(batches),
    inbox: { version: 1, entries: [] },
  };
}

describe("mod counts and coverage", () => {
  it("counts each assigned mod once, even in several batches", () => {
    const dashboard = planningDashboard(
      collection(
        [linked("a"), linked("b"), linked("c"), linked("d")],
        [batch("one", ["a", "b"]), batch("two", ["b", "c"])],
      ),
    );
    expect(dashboard).toMatchObject({
      totalMods: 4,
      assignedMods: 3,
      totalBatches: 2,
      coverage: 75,
    });
    expect(dashboard.unassigned.map((item) => item.id)).toEqual(["d"]);
  });

  it("rounds coverage and handles zero mods and zero batches", () => {
    const third = planningDashboard(
      collection(
        [linked("a"), linked("b"), linked("c")],
        [batch("one", ["a"])],
      ),
    );
    expect(third.coverage).toBe(33);
    const empty = planningDashboard(collection([], []));
    expect(empty).toMatchObject({
      totalMods: 0,
      assignedMods: 0,
      totalBatches: 0,
      coverage: null,
    });
    const noBatches = planningDashboard(collection([linked("a")], []));
    expect(noBatches.coverage).toBe(0);
    expect(noBatches.attention.unassigned).toHaveLength(1);
  });

  it("does not count deleted mod references as assigned", () => {
    const dashboard = planningDashboard(
      collection([linked("a")], [batch("one", ["a", "gone"])]),
    );
    expect(dashboard.assignedMods).toBe(1);
    expect(dashboard.coverage).toBe(100);
    expect(dashboard.batches[0]).toMatchObject({
      modCount: 1,
      deletedRefs: ["gone"],
    });
    expect(dashboard.attention.deletedRefs).toEqual([
      expect.objectContaining({ position: 1, ids: ["gone"] }),
    ]);
  });
});

describe("dependency health", () => {
  const mods = [
    linked("addon", [
      dep("p-lib"),
      dep("p-geckolib"),
      dep("p-extra", "optional"),
      dep(null),
    ]),
    linked("lib"),
    mod("manual", { source: "CurseForge" }),
  ];

  it("separates required, optional, unresolved, and unknown", () => {
    const { health } = planningDashboard(
      collection(mods, [batch("one", ["addon"])]),
    );
    expect(health).toMatchObject({
      requiredResolved: 1,
      requiredMissing: 1,
      unresolved: 1,
      optionalResolved: 0,
      optionalMissing: 1,
      unknownMods: 1,
      sources: { modrinth: 2, jar: 0, manual: 0, unknown: 1 },
    });
  });

  it("counts a relationship once when its mod is in several batches", () => {
    const once = planningDashboard(
      collection(mods, [batch("one", ["addon"])]),
    ).health;
    const twice = planningDashboard(
      collection(mods, [batch("one", ["addon"]), batch("two", ["addon"])]),
    ).health;
    expect(twice).toEqual(once);
  });

  it("lists missing and unresolved dependencies with their mods", () => {
    const { attention } = planningDashboard(collection(mods, []));
    expect(
      attention.missing.map((issue) => [issue.mod.id, issue.entry.identifier]),
    ).toEqual([["addon", "p-geckolib"]]);
    expect(attention.unresolved.map((issue) => issue.mod.id)).toEqual([
      "addon",
    ]);
  });

  it("never reports Unknown metadata as resolved", () => {
    const { health } = planningDashboard(collection([mod("x")], []));
    expect(health).toMatchObject({
      requiredResolved: 0,
      requiredMissing: 0,
      unknownMods: 1,
    });
  });
});

describe("batch breakdown and later-batch warnings", () => {
  const mods = [
    linked("addon", [dep("p-lib"), dep("p-geckolib")]),
    linked("lib"),
  ];

  it("summarises each batch in order", () => {
    const dashboard = planningDashboard(
      collection(mods, [batch("first", ["addon"]), batch("second", ["lib"])]),
    );
    expect(
      dashboard.batches.map((item) => [
        item.position,
        item.batch.id,
        item.modCount,
        item.missingRequired,
        item.later,
      ]),
    ).toEqual([
      [1, "first", 1, 1, 1],
      [2, "second", 1, 0, 0],
    ]);
    expect(dashboard.attention.later).toEqual([
      expect.objectContaining({
        position: 1,
        mod: expect.objectContaining({ id: "addon" }),
      }),
    ]);
  });

  it("does not warn when the dependency is in an earlier batch", () => {
    const dashboard = planningDashboard(
      collection(mods, [batch("first", ["lib"]), batch("second", ["addon"])]),
    );
    expect(dashboard.attention.later).toEqual([]);
  });
});

describe("updates", () => {
  it("reflects changes to mods and batches without stored state", () => {
    const before = planningDashboard(
      collection([linked("a"), linked("b")], []),
    );
    const after = planningDashboard(
      collection([linked("a"), linked("b")], [batch("one", ["a", "b"])]),
    );
    expect([before.coverage, after.coverage]).toEqual([0, 100]);
    const data = collection([linked("a")], [batch("one", ["a"])]);
    const snapshot = JSON.stringify(data);
    planningDashboard(data);
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});
