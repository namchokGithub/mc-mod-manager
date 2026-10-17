import { describe, expect, it } from "vitest";
import {
  assignContent,
  batchContent,
  batchCountText,
  removeContentFromBatches,
  unassignContent,
} from "./batchContent";
import { assignMod, moveItem, orderedBatches, withOrder } from "./batches";
import { buildGuide, defaultGuideOptions } from "./buildGuide";
import { batchDependencyOverview } from "./dependencyOverview";
import { serializeJson } from "./json";
import { planningDashboard } from "./planningDashboard";
import { quickAddMods } from "./quickAdd";
import {
  batchFileSchema,
  collectionSchema,
  parseJsonFile,
  type Batch,
  type Collection,
  type ContentItem,
  type Mod,
} from "./schema";

const generatedAt = new Date("2026-10-18T12:00:00Z");

const item = (id: string, change: Partial<ContentItem> = {}): ContentItem => ({
  id,
  name: id.toUpperCase(),
  status: "planned",
  version: "",
  description: "",
  source: "manual",
  sourceUrl: "",
  imageUrl: "",
  minecraftVersions: [],
  tags: [],
  notes: "",
  ...change,
});

const [create, flywheel] = quickAddMods(["Create", "Flywheel"], []);
// Create requires the mod ID "faithful"; a resource pack with that ID must not satisfy it.
const createMod: Mod = { ...create!, dependencies: ["faithful"] };

const legacyBatch: Batch = {
  id: "core",
  name: "Core",
  description: "Libraries first",
  order: 1,
  modIds: ["create"],
  checklist: [{ id: "step-1", text: "Launch once", done: true }],
};
const second: Batch = {
  id: "visuals",
  name: "Visuals",
  description: "",
  order: 2,
  modIds: ["flywheel"],
  checklist: [],
};

function collection(batches: Batch[]): Collection {
  return collectionSchema.parse({
    modpack: {
      name: "Pack",
      description: "",
      version: "1.0",
      minecraftVersion: "26.1.2",
      modloader: "NeoForge",
      modloaderVersion: "",
      author: "",
      updatedAt: "2026-10-18",
      heroImageUrl: "",
    },
    mods: [createMod, flywheel],
    batches: withOrder(batches),
    resourcePacks: {
      version: 1,
      type: "resourcepack",
      items: [
        item("faithful", {
          version: "1.4",
          source: "curseforge",
          sourceUrl:
            "https://www.curseforge.com/minecraft/texture-packs/faithful",
          minecraftVersions: ["26.1.2"],
          notes: "Put above default",
        }),
      ],
    },
    dataPacks: {
      version: 1,
      type: "datapack",
      items: [item("terralith")],
    },
    shaders: {
      version: 1,
      type: "shader",
      // Same ID as a resource pack: no collision, references are type + ID.
      items: [item("faithful", { name: "Faithful Shader" })],
    },
  });
}

const mixed: Batch = [
  { type: "resourcepack" as const, id: "faithful" },
  { type: "shader" as const, id: "faithful" },
  { type: "datapack" as const, id: "gone" },
].reduce(assignContent, legacyBatch);

describe("batch references", () => {
  it("loads Mod-only batches unchanged and saves them the same way", () => {
    const file = batchFileSchema.parse(withOrder([legacyBatch, second]));
    expect(file.batches[0]).toEqual(legacyBatch);
    expect("contentRefs" in file.batches[0]!).toBe(false);
    expect(serializeJson(file)).toBe(
      serializeJson(withOrder([legacyBatch, second])),
    );
  });

  it("adds content once, by type + ID, and keeps mods, order, and checklist", () => {
    expect(mixed.contentRefs).toEqual([
      { type: "resourcepack", id: "faithful" },
      { type: "shader", id: "faithful" },
      { type: "datapack", id: "gone" },
    ]);
    expect(assignContent(mixed, { type: "shader", id: "faithful" })).toBe(
      mixed,
    );
    expect(mixed).toMatchObject({
      id: "core",
      order: 1,
      modIds: ["create"],
      checklist: legacyBatch.checklist,
      description: "Libraries first",
    });
    expect(assignMod(mixed, "create")).toBe(mixed);
  });

  it("rejects duplicate references in stored data", () => {
    const bad = {
      ...legacyBatch,
      contentRefs: [
        { type: "shader", id: "a" },
        { type: "shader", id: "a" },
      ],
    };
    expect(batchFileSchema.safeParse(withOrder([bad as Batch])).success).toBe(
      false,
    );
  });

  it("removes one reference and drops the empty list", () => {
    const one = assignContent(legacyBatch, { type: "shader", id: "x" });
    expect(unassignContent(one, { type: "shader", id: "x" })).toEqual(
      legacyBatch,
    );
    expect(
      unassignContent(mixed, { type: "shader", id: "faithful" }).contentRefs,
    ).toHaveLength(2);
  });

  it("removes deleted entries of one type only", () => {
    const file = removeContentFromBatches(
      withOrder([mixed, second]),
      "resourcepack",
      ["faithful"],
    );
    expect(file.batches[0]?.contentRefs).toEqual([
      { type: "shader", id: "faithful" },
      { type: "datapack", id: "gone" },
    ]);
    expect(file.batches[1]).toEqual({ ...second, order: 2 });
  });

  it("resolves references and reports missing ones instead of dropping them", () => {
    const content = batchContent(mixed, collection([mixed]));
    expect(content.resourcepack.items.map((entry) => entry.name)).toEqual([
      "FAITHFUL",
    ]);
    expect(content.shader.items.map((entry) => entry.name)).toEqual([
      "Faithful Shader",
    ]);
    expect(content.datapack).toEqual({ items: [], missing: ["gone"] });
    expect(batchCountText(1, content)).toBe(
      "1 mod · 1 resource pack · 1 shader",
    );
  });

  it("keeps batch order when batches are moved", () => {
    const moved = withOrder(moveItem([mixed, second], 0, 1));
    expect(orderedBatches(moved).map((batch) => batch.id)).toEqual([
      "visuals",
      "core",
    ]);
    expect(orderedBatches(moved)[1]?.contentRefs).toEqual(mixed.contentRefs);
  });

  it("survives JSON export and import", () => {
    const text = serializeJson(withOrder([mixed, second]));
    expect(parseJsonFile(text, "batches")).toEqual(withOrder([mixed, second]));
  });
});

describe("mod dependencies", () => {
  it("never count content as a mod", () => {
    const plain = collection([legacyBatch, second]);
    const withContent = collection([mixed, second]);
    const overview = batchDependencyOverview(
      "core",
      withContent.batches,
      withContent.mods,
    );
    expect(overview).toEqual(
      batchDependencyOverview("core", plain.batches, plain.mods),
    );
    expect(
      overview.mods[0]?.entries.find((entry) => entry.identifier === "faithful")
        ?.status,
    ).not.toBe("resolved");
  });

  it("keeps cross-batch warnings", () => {
    const needsLater: Mod = { ...createMod, dependencies: ["flywheel"] };
    const data = {
      ...collection([mixed, second]),
      mods: [needsLater, flywheel!],
    };
    const overview = batchDependencyOverview("core", data.batches, data.mods);
    expect(overview.counts.later).toBe(1);
  });
});

describe("dashboard", () => {
  const plain = planningDashboard(collection([legacyBatch, second]));
  const withContent = planningDashboard(collection([mixed, second]));

  it("keeps every mod-only figure", () => {
    expect(withContent.totalMods).toBe(plain.totalMods);
    expect(withContent.assignedMods).toBe(plain.assignedMods);
    expect(withContent.coverage).toBe(plain.coverage);
    expect(withContent.health).toEqual(plain.health);
    expect(withContent.attention.deletedRefs).toEqual(
      plain.attention.deletedRefs,
    );
  });

  it("counts every collection together by unique type + ID", () => {
    expect(withContent.combined).toEqual({
      totals: { mods: 2, resourcePacks: 1, dataPacks: 1, shaders: 1 },
      totalItems: 5,
      assignedItems: 4,
      unassignedItems: 1,
      coverage: 80,
    });
    expect(plain.combined.assignedItems).toBe(2);
    expect(withContent.batches[0]).toMatchObject({
      contentCount: 2,
      missingContent: [{ type: "datapack", id: "gone" }],
    });
    expect(withContent.attention.deletedContentRefs).toHaveLength(1);
  });
});

describe("build guide", () => {
  const data = collection([mixed, second]);

  it("groups content in Markdown with sources, verification, and install notes", () => {
    const guide = buildGuide(data, defaultGuideOptions, generatedAt);
    expect(guide).toContain("1 mod · 1 resource pack · 1 shader");
    expect(guide).toContain("### Resource packs");
    expect(guide).toContain(
      "- [ ] FAITHFUL 1.4 — [CurseForge](https://www.curseforge.com/minecraft/texture-packs/faithful)",
    );
    expect(guide).toContain("Minecraft: 26.1.2 — Unverified");
    expect(guide).toContain("Notes: Put above default");
    expect(guide).toContain("### Shaders");
    expect(guide).toContain("Shader runtime: not checked");
    expect(guide).toContain("No longer in the data packs list: gone.");
    expect(guide).toContain("### Installation notes");
    expect(guide).toContain("shaderpacks/");
    // Only kinds of content actually in the batch get a note.
    expect(guide).not.toContain("datapacks/");
    expect(guide).toContain("Checked for mods only.");
    expect(guide).toContain("Launch once");
    expect(guide).not.toMatch(/download/i);
  });

  it("writes clean text", () => {
    const text = buildGuide(
      data,
      { ...defaultGuideOptions, format: "text" },
      generatedAt,
    );
    expect(text).toContain("Resource packs\n--------------");
    expect(text).toContain(
      "FAITHFUL 1.4 — CurseForge (https://www.curseforge.com/minecraft/texture-packs/faithful)",
    );
    expect(text).toContain("Installation notes\n------------------");
  });

  it("adds the world-specific data pack note when a data pack is in the batch", () => {
    const withPack = assignContent(second, {
      type: "datapack",
      id: "terralith",
    });
    const guide = buildGuide(
      collection([legacyBatch, withPack]),
      { ...defaultGuideOptions, batchId: "visuals" },
      generatedAt,
    );
    expect(guide).toContain("saves/\\<world\\>/datapacks/");
    expect(guide).toContain("world-specific setup");
  });

  it("exports only the selected batch", () => {
    const guide = buildGuide(
      data,
      { ...defaultGuideOptions, batchId: "visuals" },
      generatedAt,
    );
    expect(guide).toContain("Batch 2 — Visuals");
    expect(guide).not.toContain("Resource packs");
    expect(guide).not.toContain("Batch 1");
  });

  it("leaves a mod-only guide's mod sections as they were", () => {
    const plain = buildGuide(
      collection([legacyBatch, second]),
      defaultGuideOptions,
      generatedAt,
    );
    expect(plain).toContain("1 mod\n");
    expect(plain).not.toContain("Resource packs");
    expect(plain).not.toContain("Checked for mods only.");
  });
});
