import { describe, expect, it } from "vitest";
import modpackJson from "../../public/data/modpack.json";
import modsJson from "../../public/data/mods.json";
import resourcePacksJson from "../../public/data/resource-packs.json";
import dataPacksJson from "../../public/data/data-packs.json";
import shadersJson from "../../public/data/shaders.json";
import {
  addContentItem,
  deleteContentItem,
  emptyContentInput,
  parseContentFile,
  queryContent,
  updateContentItem,
  type ContentInput,
} from "./content";
import { serializeJson } from "./json";
import { planningDashboard } from "./planningDashboard";
import {
  collectionSchema,
  contentFileSchema,
  type ContentItem,
} from "./schema";
import { parseDraft } from "./storage";

const t0 = new Date("2026-10-18T08:00:00.000Z");
const t1 = new Date("2026-10-18T09:00:00.000Z");
const input = (change: Partial<ContentInput> = {}): ContentInput => ({
  ...emptyContentInput(),
  name: "Faithful 32x",
  ...change,
});
const added = (items: ContentItem[], change?: Partial<ContentInput>) => {
  const result = addContentItem(items, input(change), t0);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.items;
};

describe("content files", () => {
  it("accepts the published empty files", () => {
    expect(contentFileSchema("resourcepack").parse(resourcePacksJson)).toEqual({
      version: 1,
      type: "resourcepack",
      items: [],
    });
    expect(contentFileSchema("datapack").safeParse(dataPacksJson).success).toBe(
      true,
    );
    expect(contentFileSchema("shader").safeParse(shadersJson).success).toBe(
      true,
    );
  });

  it("fills optional fields and keeps unknown ones", () => {
    const file = contentFileSchema("shader").parse({
      version: 1,
      type: "shader",
      items: [{ id: "bsl", name: "BSL", status: "planned", runtime: "iris" }],
    });
    expect(file.items[0]).toEqual({
      id: "bsl",
      name: "BSL",
      status: "planned",
      runtime: "iris",
      version: "",
      description: "",
      source: "manual",
      sourceUrl: "",
      imageUrl: "",
      minecraftVersions: [],
      tags: [],
      notes: "",
    });
  });

  it.each([
    ["malformed JSON", "{", "not valid JSON"],
    [
      "the wrong collection type",
      JSON.stringify({ version: 1, type: "shader", items: [] }),
      "type",
    ],
    [
      "duplicate IDs",
      JSON.stringify({
        version: 1,
        type: "resourcepack",
        items: [
          { id: "a", name: "A", status: "planned" },
          { id: "a", name: "B", status: "planned" },
        ],
      }),
      "Duplicate ID: a",
    ],
    [
      "a bad URL",
      JSON.stringify({
        version: 1,
        type: "resourcepack",
        items: [{ id: "a", name: "A", status: "planned", sourceUrl: "x" }],
      }),
      "sourceUrl",
    ],
    [
      "an unknown status",
      JSON.stringify({
        version: 1,
        type: "resourcepack",
        items: [{ id: "a", name: "A", status: "in_testing" }],
      }),
      "status",
    ],
  ])("rejects %s on import", (_, text, message) => {
    expect(() => parseContentFile(text, "resourcePacks")).toThrow(message);
  });
});

describe("adding, editing, and deleting", () => {
  it("adds a Planned entry with an ID from its name and timestamps", () => {
    const [item] = added([]);
    expect(item).toMatchObject({
      id: "faithful-32x",
      name: "Faithful 32x",
      status: "planned",
      source: "manual",
      createdAt: t0.toISOString(),
      updatedAt: t0.toISOString(),
    });
  });

  it("never reuses an ID", () => {
    const items = added(added([]));
    expect(items.map((item) => item.id)).toEqual([
      "faithful-32x",
      "faithful-32x-2",
    ]);
  });

  it("keeps the ID, creation date, and unknown fields when edited", () => {
    const items = added([]).map((item) => ({ ...item, world: "Survival" }));
    const result = updateContentItem(
      items,
      "faithful-32x",
      input({
        name: "Faithful 64x",
        status: "installed",
        sourceUrl: "https://www.curseforge.com/minecraft/texture-packs/x",
        source: "curseforge",
        tags: [" Vanilla ", "Vanilla"],
      }),
      t1,
    );
    expect(result.ok && result.item).toMatchObject({
      id: "faithful-32x",
      name: "Faithful 64x",
      status: "installed",
      tags: ["Vanilla"],
      world: "Survival",
      createdAt: t0.toISOString(),
      updatedAt: t1.toISOString(),
    });
  });

  it("reports field errors and changes nothing when invalid", () => {
    const items = added([]);
    const result = updateContentItem(
      items,
      "faithful-32x",
      input({ name: " ", imageUrl: "not a url" }),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      "imageUrl",
      "name",
    ]);
    expect(items[0]?.name).toBe("Faithful 32x");
  });

  it("deletes by ID", () => {
    const items = added(added([]));
    expect(
      deleteContentItem(items, "faithful-32x").map((item) => item.id),
    ).toEqual(["faithful-32x-2"]);
  });
});

describe("searching, filtering, and sorting", () => {
  const items = [
    { name: "Stay True", status: "installed" as const },
    { name: "Fresh Animations", status: "planned" as const },
    { name: "faithful", status: "testing" as const },
  ].reduce<ContentItem[]>((list, change) => added(list, change), []);

  it("searches names case-insensitively and filters by status", () => {
    expect(
      queryContent(items, { query: "FRESH", status: "", sort: "name" }).map(
        (item) => item.name,
      ),
    ).toEqual(["Fresh Animations"]);
    expect(
      queryContent(items, { query: "", status: "testing", sort: "name" }).map(
        (item) => item.name,
      ),
    ).toEqual(["faithful"]);
  });

  it("sorts by name either way and by status", () => {
    const names = (sort: "name" | "name-desc" | "status") =>
      queryContent(items, { query: "", status: "", sort }).map(
        (item) => item.name,
      );
    expect(names("name")).toEqual([
      "faithful",
      "Fresh Animations",
      "Stay True",
    ]);
    expect(names("name-desc")).toEqual([
      "Stay True",
      "Fresh Animations",
      "faithful",
    ]);
    expect(names("status")).toEqual([
      "Stay True",
      "faithful",
      "Fresh Animations",
    ]);
  });
});

describe("collection loading and drafts", () => {
  const published = collectionSchema.parse({
    modpack: modpackJson,
    mods: modsJson,
  });

  it("treats missing content files as empty collections", () => {
    expect(published.resourcePacks.items).toEqual([]);
    expect(published.shaders.type).toBe("shader");
  });

  it("fills content from published data for drafts saved before it existed", () => {
    const withContent = {
      ...published,
      shaders: {
        version: 1 as const,
        type: "shader" as const,
        items: added([]),
      },
    };
    const oldDraft = JSON.stringify({
      modpack: published.modpack,
      mods: published.mods,
    });
    expect(parseDraft(oldDraft, withContent)?.shaders).toEqual(
      withContent.shaders,
    );
  });

  it("round-trips through export and import", () => {
    const file = {
      version: 1 as const,
      type: "datapack" as const,
      items: added([]),
    };
    expect(parseContentFile(serializeJson(file), "dataPacks")).toEqual(file);
  });

  it("does not change mod planning", () => {
    const withContent = {
      ...published,
      resourcePacks: {
        version: 1 as const,
        type: "resourcepack" as const,
        items: added([]),
      },
    };
    expect(planningDashboard(withContent)).toEqual(
      planningDashboard(published),
    );
  });
});
