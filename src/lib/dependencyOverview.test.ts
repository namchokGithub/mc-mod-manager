import { describe, expect, it } from "vitest";
import batchesJson from "../../public/data/batches.json";
import modsJson from "../../public/data/mods.json";
import { withOrder } from "./batches";
import { batchDependencyOverview, placementText } from "./dependencyOverview";
import { batchFileSchema, modsSchema, type Batch, type Mod } from "./schema";

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

const batch = (id: string, modIds: string[]): Batch => ({
  id,
  name: id,
  description: "",
  order: 1,
  modIds,
  checklist: [],
});

const requires = (projectId: string | null, type = "required" as const) => ({
  projectId,
  versionId: null,
  type,
});

describe("required and optional dependencies", () => {
  it("separates relations and resolves Modrinth project IDs", () => {
    const mods = [
      linked("iris", [
        requires("p-sodium"),
        { ...requires("p-modmenu"), type: "optional" },
      ]),
      linked("sodium"),
    ];
    const plan = withOrder([batch("one", ["iris", "sodium"])]);
    const overview = batchDependencyOverview("one", plan, mods);
    const iris = overview.mods.find((item) => item.mod.id === "iris")!;
    expect(iris.source).toBe("modrinth");
    expect(iris.entries.map((entry) => [entry.relation, entry.status])).toEqual(
      [
        ["required", "resolved"],
        ["optional", "missing"],
      ],
    );
    expect(iris.entries[0]?.target?.id).toBe("sodium");
    expect(overview.counts).toMatchObject({
      resolved: 1,
      missing: 1,
      unknown: 0,
    });
  });

  it("skips embedded dependencies and self-references", () => {
    const self = linked("lib", [
      requires("p-lib"),
      { projectId: "p-bundled", versionId: null, type: "embedded" },
    ]);
    const overview = batchDependencyOverview(
      "one",
      withOrder([batch("one", ["lib"])]),
      [self],
    );
    expect(overview.mods[0]?.entries).toEqual([]);
  });

  it("keeps the stronger relation when a dependency is listed twice", () => {
    const mods = [
      linked("a", [{ ...requires("p-b"), type: "optional" }, requires("p-b")]),
      linked("b"),
    ];
    const entries = batchDependencyOverview(
      "one",
      withOrder([batch("one", ["a"])]),
      mods,
    ).mods[0]!.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.relation).toBe("required");
  });
});

describe("matching by identifier", () => {
  it("matches JAR loader mod IDs only against imported mod IDs", () => {
    const jarMod = mod("create-addon", {
      source: "CurseForge",
      file: {
        name: "addon.jar",
        modId: "addon",
        format: "neoforge.mods.toml",
        dependencies: [
          { modId: "create", kind: "required" },
          { modId: "jei", kind: "optional" },
        ],
      },
    });
    const create = mod("create-mod", {
      file: {
        name: "create.jar",
        modId: "create",
        format: "neoforge.mods.toml",
      },
    });
    // Same app ID as the dependency, but no loader mod ID: not a reliable match.
    const jei = mod("jei");
    const overview = batchDependencyOverview(
      "one",
      withOrder([batch("one", ["create-addon"])]),
      [jarMod, create, jei],
    );
    const entries = overview.mods[0]!.entries;
    expect(overview.mods[0]?.source).toBe("jar");
    expect(
      entries.find((entry) => entry.identifier === "create"),
    ).toMatchObject({
      status: "resolved",
      identifierKind: "loader-mod-id",
    });
    expect(entries.find((entry) => entry.identifier === "jei")?.status).toBe(
      "missing",
    );
  });

  it("matches manual references only by exact mod ID, never by name", () => {
    const a = mod("a", {
      source: "Other",
      dependencies: ["lib-mod", "Fancy Library"],
    });
    const lib = mod("lib-mod", { name: "Fancy Library" });
    const entries = batchDependencyOverview(
      "one",
      withOrder([batch("one", ["a"])]),
      [a, lib],
    ).mods[0]!.entries;
    expect(
      entries.map((entry) => [entry.identifier, entry.status, entry.source]),
    ).toEqual([
      ["lib-mod", "resolved", "manual"],
      ["Fancy Library", "unresolved", "manual"],
    ]);
  });

  it("prefers Modrinth data over JAR and manual lists", () => {
    const both = linked("a", []);
    both.file = {
      name: "a.jar",
      format: "mods.toml",
      dependencies: [{ modId: "x", kind: "required" }],
    };
    both.dependencies = ["x"];
    expect(
      batchDependencyOverview("one", withOrder([batch("one", ["a"])]), [both])
        .mods[0],
    ).toMatchObject({ source: "modrinth", entries: [] });
  });

  it("reports ambiguous matches and missing project IDs as unresolved", () => {
    const mods = [
      linked("a", [requires("p-shared"), requires(null)]),
      mod("one", { modrinth: { projectId: "p-shared" } }),
      mod("two", { modrinth: { projectId: "p-shared" } }),
    ];
    const entries = batchDependencyOverview(
      "b",
      withOrder([batch("b", ["a"])]),
      mods,
    ).mods[0]!.entries;
    expect(entries.map((entry) => entry.status)).toEqual([
      "unresolved",
      "unresolved",
    ]);
    expect(entries[0]?.reason).toContain("2 mods share this ID");
  });
});

describe("unknown metadata", () => {
  it("never treats a mod without metadata as having no dependencies", () => {
    const overview = batchDependencyOverview(
      "one",
      withOrder([batch("one", ["manual"])]),
      [mod("manual", { source: "CurseForge" })],
    );
    expect(overview.mods[0]).toMatchObject({ source: "unknown", entries: [] });
    expect(overview.counts.unknown).toBe(1);
  });

  it("treats a file-name-only import as unknown", () => {
    const guess = mod("g", { file: { name: "g-1.0.jar", format: "filename" } });
    expect(
      batchDependencyOverview("one", withOrder([batch("one", ["g"])]), [guess])
        .mods[0]?.source,
    ).toBe("unknown");
  });
});

describe("cross-batch references", () => {
  const mods = [
    linked("addon", [requires("p-lib")]),
    linked("lib"),
    linked("other"),
  ];

  it("shows a dependency in the same batch", () => {
    const entry = batchDependencyOverview(
      "one",
      withOrder([batch("one", ["addon", "lib"])]),
      mods,
    ).mods[0]!.entries[0]!;
    expect(entry.inCurrentBatch).toBe(true);
    expect(placementText(entry)).toBe("In this batch");
  });

  it("is fine when the dependency is in an earlier batch", () => {
    const plan = withOrder([
      batch("first", ["lib"]),
      batch("second", ["addon"]),
    ]);
    const overview = batchDependencyOverview("second", plan, mods);
    const entry = overview.mods[0]!.entries[0]!;
    expect(entry.laterOnly).toBe(false);
    expect(placementText(entry)).toBe("In Batch 1 (first)");
    expect(overview.counts.later).toBe(0);
  });

  it("warns when a required dependency is only in a later batch", () => {
    const plan = withOrder([
      batch("first", ["addon"]),
      batch("second", ["lib"]),
    ]);
    const overview = batchDependencyOverview("first", plan, mods);
    expect(overview.mods[0]!.entries[0]!.laterOnly).toBe(true);
    expect(overview.counts.later).toBe(1);
  });

  it("does not warn when it is also in an earlier or the same batch", () => {
    const plan = withOrder([
      batch("first", ["lib"]),
      batch("second", ["addon"]),
      batch("third", ["lib"]),
    ]);
    const entry = batchDependencyOverview("second", plan, mods).mods[0]!
      .entries[0]!;
    expect(entry.laterOnly).toBe(false);
    expect(placementText(entry)).toBe("In Batch 1 (first), Batch 3 (third)");
  });

  it("reports mods that are in the list but not in any batch", () => {
    const entry = batchDependencyOverview(
      "one",
      withOrder([batch("one", ["addon"])]),
      mods,
    ).mods[0]!.entries[0]!;
    expect(entry.status).toBe("resolved");
    expect(placementText(entry)).toBe("In the mod list, not in any batch");
  });

  it("ignores batch references to deleted mods and unknown batches", () => {
    const plan = withOrder([batch("one", ["gone", "addon"])]);
    expect(
      batchDependencyOverview("one", plan, mods).mods.map(
        (item) => item.mod.id,
      ),
    ).toEqual(["addon"]);
    expect(batchDependencyOverview("missing", plan, mods).mods).toEqual([]);
  });
});

describe("existing JSON", () => {
  it("builds an overview from the published files without errors", () => {
    const mods = modsSchema.parse(modsJson);
    const plan = withOrder([
      batch(
        "all",
        mods.map((item) => item.id),
      ),
    ]);
    expect(batchFileSchema.safeParse(batchesJson).success).toBe(true);
    const overview = batchDependencyOverview("all", plan, mods);
    expect(overview.mods).toHaveLength(mods.length);
  });
});
