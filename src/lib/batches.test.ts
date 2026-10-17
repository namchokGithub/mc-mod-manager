import { describe, expect, it } from "vitest";
import modpackJson from "../../public/data/modpack.json";
import batchesJson from "../../public/data/batches.json";
import {
  assignMod,
  batchMods,
  moveItem,
  newBatchId,
  newChecklistId,
  orderedBatches,
  removeModsFromBatches,
  renameModInBatches,
  unassignMod,
  withOrder,
} from "./batches";
import {
  batchFileSchema,
  collectionSchema,
  parseJsonFile,
  type Batch,
  type Mod,
} from "./schema";
import { DRAFT_KEY, loadDraft, parseDraft } from "./storage";

function batch(id: string, order: number, modIds: string[] = []): Batch {
  return { id, name: id, description: "", order, modIds, checklist: [] };
}

function mod(id: string): Mod {
  return {
    id,
    name: id.toUpperCase(),
    version: "",
    category: "c",
    tags: [],
    status: "planned",
    side: "both",
    source: "CurseForge",
    sourceUrl: "",
    description: "",
    dependencies: [],
    notes: "",
    imageUrl: "",
  };
}

describe("batch file", () => {
  it("accepts the published batches.json", () => {
    expect(batchFileSchema.safeParse(batchesJson).success).toBe(true);
  });

  it("fills an omitted description and loads collections without a plan", () => {
    const parsed = batchFileSchema.parse({
      version: 1,
      batches: [{ id: "a", name: "A", order: 1, modIds: [], checklist: [] }],
    });
    expect(parsed.batches[0]?.description).toBe("");
    const collection = collectionSchema.parse({
      modpack: modpackJson,
      mods: [],
    });
    expect(collection.batches).toEqual({ version: 1, batches: [] });
  });

  it("rejects duplicates and empty names", () => {
    const twice = batch("a", 1, ["x", "x"]);
    expect(() =>
      parseJsonFile(
        JSON.stringify({ version: 1, batches: [twice] }),
        "batches",
      ),
    ).toThrow("listed twice");
    expect(() =>
      parseJsonFile(
        JSON.stringify({ version: 1, batches: [batch("a", 1), batch("a", 2)] }),
        "batches",
      ),
    ).toThrow("Duplicate batch ID");
    expect(() =>
      parseJsonFile(
        JSON.stringify({
          version: 1,
          batches: [{ ...batch("a", 1), name: " " }],
        }),
        "batches",
      ),
    ).toThrow("Batch name is required");
    expect(() =>
      parseJsonFile('{"version":2,"batches":[]}', "batches"),
    ).toThrow();
  });

  it("allows references to mods that are not in the list", () => {
    expect(
      batchFileSchema.safeParse({
        version: 1,
        batches: [batch("a", 1, ["gone"])],
      }).success,
    ).toBe(true);
  });
});

describe("ordering", () => {
  it("sorts by order and rewrites order from array position", () => {
    const file = {
      version: 1 as const,
      batches: [batch("b", 2), batch("a", 1)],
    };
    expect(orderedBatches(file).map((item) => item.id)).toEqual(["a", "b"]);
    expect(
      withOrder([batch("x", 9), batch("y", 3)]).batches.map(
        (item) => item.order,
      ),
    ).toEqual([1, 2]);
  });

  it("moves items one step and ignores moves past the ends", () => {
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("creates unique batch and checklist IDs", () => {
    expect(newBatchId("Core libraries", [batch("core-libraries", 1)])).toBe(
      "core-libraries-2",
    );
    expect(
      newChecklistId([
        { id: "step-1", text: "a", done: false },
        { id: "step-3", text: "b", done: false },
      ]),
    ).toBe("step-4");
  });
});

describe("assigning mods", () => {
  it("adds a mod once and removes it without touching other batches", () => {
    const once = assignMod(batch("a", 1), "sodium");
    expect(assignMod(once, "sodium").modIds).toEqual(["sodium"]);
    expect(unassignMod(once, "sodium").modIds).toEqual([]);
  });

  it("allows the same mod in several batches", () => {
    const file = withOrder([batch("a", 1, ["x"]), batch("b", 2, ["x"])]);
    expect(batchFileSchema.safeParse(file).success).toBe(true);
  });

  it("follows a renamed mod ID without creating duplicates", () => {
    const file = withOrder([
      batch("a", 1, ["old", "new"]),
      batch("b", 2, ["old"]),
    ]);
    const renamed = renameModInBatches(file, "old", "new");
    expect(renamed.batches.map((item) => item.modIds)).toEqual([
      ["new"],
      ["new"],
    ]);
  });

  it("drops deleted mods from every batch but keeps the batches", () => {
    const file = withOrder([batch("a", 1, ["x", "y"]), batch("b", 2, ["x"])]);
    const cleaned = removeModsFromBatches(file, ["x"]);
    expect(cleaned.batches.map((item) => item.modIds)).toEqual([["y"], []]);
  });

  it("reports references to missing mods instead of failing", () => {
    const result = batchMods(batch("a", 1, ["x", "gone", "y"]), [
      mod("x"),
      mod("y"),
    ]);
    expect(result.mods.map((item) => item.id)).toEqual(["x", "y"]);
    expect(result.missing).toEqual(["gone"]);
  });
});

describe("drafts and the build plan", () => {
  const published = collectionSchema.parse({
    modpack: modpackJson,
    mods: [mod("x")],
    batches: { version: 1, batches: [batch("core", 1, ["x"])] },
  });

  it("gives older drafts without a plan the published plan", () => {
    const oldDraft = JSON.stringify({
      modpack: { ...published.modpack, name: "Edited" },
      mods: published.mods,
    });
    expect(parseDraft(oldDraft, published)?.batches).toEqual(
      published.batches,
    );
    const storage = {
      items: new Map([[DRAFT_KEY, oldDraft]]),
      getItem(key: string) {
        return this.items.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        this.items.set(key, value);
      },
      removeItem(key: string) {
        this.items.delete(key);
      },
    };
    expect(loadDraft(storage, published).draft?.batches).toEqual(
      published.batches,
    );
  });

  it("keeps a draft's own plan, even when it is empty", () => {
    const draft = JSON.stringify({
      ...published,
      batches: { version: 1, batches: [] },
    });
    expect(parseDraft(draft, published)?.batches.batches).toEqual([]);
  });
});
