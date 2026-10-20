import { describe, expect, it } from "vitest";
import { withOrder } from "./batches";
import { checkCompatibility } from "./compatibility";
import { batchDependencyOverview } from "./dependencyOverview";
import { mergeCandidateIntoMod, type ImportCandidate } from "./jar/importing";
import { describeChanges } from "./modChanges";
import { mergeModrinthIntoMod } from "./modrinth/mapping";
import { planningDashboard } from "./planningDashboard";
import { DEFAULT_CATEGORY, quickAddMods } from "./quickAdd";
import { emptyContent, modsSchema, type Collection, type Mod } from "./schema";

const existing = quickAddMods(["Sodium"], []);

describe("creating name-only mods", () => {
  it("uses the existing unknown conventions and validates", () => {
    const [mod] = quickAddMods(["Farmer's Delight"], existing);
    expect(mod).toEqual({
      id: "farmer-s-delight",
      name: "Farmer's Delight",
      version: "",
      category: DEFAULT_CATEGORY,
      tags: [],
      status: "planned",
      side: "both",
      source: "Other",
      sourceUrl: "",
      description: "",
      dependencies: [],
      notes: "",
      imageUrl: "",
    });
    expect(modsSchema.safeParse([...existing, mod]).success).toBe(true);
  });

  it("gives unique IDs and the chosen category", () => {
    const mods = quickAddMods(["Sodium", "Sodium"], existing, "Performance");
    expect(mods.map((mod) => mod.id)).toEqual(["sodium-2", "sodium-3"]);
    expect(mods.every((mod) => mod.category === "Performance")).toBe(true);
    expect(quickAddMods(["X"], [], "  ")[0]?.category).toBe(DEFAULT_CATEGORY);
  });
});

describe("integration with planning", () => {
  const added = quickAddMods(["Create", "JEI"], []);
  const collection: Collection = {
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
    mods: added,
    batches: withOrder([
      {
        id: "b",
        name: "B",
        description: "",
        order: 1,
        steps: [
          {
            id: "install",
            name: "Install",
            description: "",
            done: false,
            itemRefs: ["create"].map((id) => ({ type: "mod" as const, id })),
          },
        ],
      },
    ]),
    inbox: { version: 1, entries: [] },
  };

  it("stays Unknown for compatibility and dependencies", () => {
    expect(
      checkCompatibility(added, collection.modpack).get("create"),
    ).toMatchObject({
      status: "unknown",
      verification: "manual",
    });
    expect(
      batchDependencyOverview("b", collection.batches, added).mods[0]?.source,
    ).toBe("unknown");
  });

  it("counts as unassigned until added to a batch", () => {
    expect(
      planningDashboard(collection).unassigned.map((mod) => mod.id),
    ).toEqual(["jei"]);
  });
});

describe("enriching later", () => {
  const [base] = quickAddMods(["Create"], []);
  const named: Mod = { ...base!, status: "testing", notes: "Mine" };

  it("keeps ID, name, status, and notes when linking to Modrinth", () => {
    const incoming: Mod = {
      ...named,
      id: "create-fabric",
      name: "Create Fabric",
      version: "6.0.0",
      description: "Gears",
      source: "Modrinth",
      sourceUrl: "https://modrinth.com/mod/create",
      modrinth: { projectId: "P", versionId: "V", versionNumber: "6.0.0" },
    };
    const merged = mergeModrinthIntoMod(named, incoming);
    expect(merged).toMatchObject({
      id: "create",
      name: "Create",
      status: "testing",
      notes: "Mine",
    });
    const changes = describeChanges(named, merged);
    expect(changes.map((change) => change.field)).toEqual([
      "version",
      "sourceUrl",
      "description",
      "modrinth",
    ]);
    expect(changes.every((change) => !change.overwrites)).toBe(true);
  });

  it("updates the existing mod from a JAR instead of creating one", () => {
    const candidate: ImportCandidate = {
      key: "k",
      metadata: {
        fileName: "create-6.0.jar",
        format: "neoforge.mods.toml",
        readable: true,
        modId: "create",
        version: "6.0.0",
        description: "Gears",
        side: null,
        loaders: ["neoforge"],
        minecraftRange: "[26.1,)",
        dependencies: [{ modId: "flywheel", kind: "required" }],
        warnings: [],
      },
    };
    const merged = mergeCandidateIntoMod(named, candidate);
    expect(merged).toMatchObject({
      id: "create",
      name: "Create",
      status: "testing",
      notes: "Mine",
      version: "6.0.0",
      description: "Gears",
      dependencies: ["flywheel"],
      file: {
        name: "create-6.0.jar",
        modId: "create",
        minecraftRange: "[26.1,)",
      },
    });
    expect(merged.modrinth).toBeUndefined();
  });

  it("flags when a preview would replace values the user entered", () => {
    const edited: Mod = {
      ...named,
      version: "5.0",
      description: "Hand written",
    };
    const after: Mod = { ...edited, version: "6.0.0" };
    expect(describeChanges(edited, after)).toEqual([
      {
        field: "version",
        label: "Version",
        from: "5.0",
        to: "6.0.0",
        overwrites: true,
      },
    ]);
  });
});
