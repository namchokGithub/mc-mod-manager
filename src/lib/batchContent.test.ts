import { describe, expect, it } from "vitest";
import {
  batchContent,
  batchCountText,
  contentRefsOf,
  removeContentFromBatches,
} from "./batchContent";
import type { Batch, Collection, ContentItem } from "./schema";

const item = (id: string): ContentItem => ({
  id,
  name: id,
  version: "",
  status: "planned",
  source: "manual",
  sourceUrl: "",
  description: "",
  minecraftVersions: [],
  tags: [],
  notes: "",
  imageUrl: "",
});

const batch: Batch = {
  id: "foundation",
  name: "Foundation",
  description: "",
  order: 1,
  steps: [
    {
      id: "install",
      name: "Install",
      description: "",
      done: false,
      itemRefs: [
        { type: "mod", id: "sodium" },
        { type: "resourcepack", id: "faithful" },
        { type: "shader", id: "missing" },
      ],
    },
  ],
};

const collection = {
  resourcePacks: {
    version: 1,
    type: "resourcepack",
    items: [item("faithful")],
  },
  dataPacks: { version: 1, type: "datapack", items: [] },
  shaders: { version: 1, type: "shader", items: [] },
} as Pick<Collection, "resourcePacks" | "dataPacks" | "shaders">;

describe("Step content", () => {
  it("resolves content references owned by Steps", () => {
    const result = batchContent(batch, collection);
    expect(result.resourcepack.items.map((entry) => entry.id)).toEqual([
      "faithful",
    ]);
    expect(result.shader.missing).toEqual(["missing"]);
    expect(contentRefsOf(batch)).toEqual([
      { type: "resourcepack", id: "faithful" },
      { type: "shader", id: "missing" },
    ]);
    expect(batchCountText(1, result)).toBe("1 mod · 1 resource pack");
  });

  it("removes deleted content from every Step without removing mods", () => {
    const cleaned = removeContentFromBatches(
      { version: 2, batches: [batch] },
      "resourcepack",
      ["faithful"],
    );
    expect(cleaned.batches[0]?.steps[0]?.itemRefs).toEqual([
      { type: "mod", id: "sodium" },
      { type: "shader", id: "missing" },
    ]);
  });
});
