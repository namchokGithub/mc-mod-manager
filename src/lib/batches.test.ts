import { describe, expect, it } from "vitest";
import modpackJson from "../../public/data/modpack.json";
import batchesJson from "../../public/data/batches.json";
import {
  assignItem,
  batchMods,
  moveItem,
  moveItemToStep,
  newBatchId,
  newStepId,
  orderedBatches,
  removeModsFromBatches,
  renameModInBatches,
  unassignItem,
  withOrder,
} from "./batches";
import {
  batchFileSchema,
  collectionSchema,
  parseJsonFile,
  type Batch,
  type Mod,
  type Step,
} from "./schema";
import { DRAFT_KEY, loadDraft, parseDraft } from "./storage";

function step(id: string, itemRefs: Step["itemRefs"] = []): Step {
  return { id, name: id, description: "", done: false, itemRefs };
}

function batch(id: string, order: number, steps: Step[] = []): Batch {
  return { id, name: id, description: "", order, steps };
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
  it("accepts steps that own every installable item type", () => {
    expect(
      batchFileSchema.safeParse({
        version: 2,
        batches: [
          {
            id: "foundation",
            name: "Foundation",
            description: "",
            order: 1,
            steps: [
              {
                id: "step-1",
                name: "Install core",
                description: "Install these first.",
                done: false,
                itemRefs: [
                  { type: "mod", id: "sodium" },
                  { type: "resourcepack", id: "faithful" },
                  { type: "datapack", id: "vanilla-tweaks" },
                  { type: "shader", id: "complementary" },
                ],
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts the published batches.json", () => {
    expect(batchFileSchema.safeParse(batchesJson).success).toBe(true);
  });

  it("fills omitted descriptions and defaults a missing plan", () => {
    const parsed = batchFileSchema.parse({
      version: 2,
      batches: [{ id: "a", name: "A", order: 1, steps: [] }],
    });
    expect(parsed.batches[0]?.description).toBe("");
    expect(
      collectionSchema.parse({ modpack: modpackJson, mods: [] }).batches,
    ).toEqual({ version: 2, batches: [] });
  });

  it("rejects duplicate items within a Step", () => {
    expect(() =>
      parseJsonFile(
        JSON.stringify({
          version: 2,
          batches: [
            batch("a", 1, [
              step("step-1", [
                { type: "mod", id: "x" },
                { type: "mod", id: "x" },
              ]),
            ]),
          ],
        }),
        "batches",
      ),
    ).toThrow("listed twice");
  });
});

describe("batch helpers", () => {
  it("sorts batches and generates unique IDs", () => {
    expect(
      orderedBatches({
        version: 2,
        batches: [batch("b", 2), batch("a", 1)],
      }).map((item) => item.id),
    ).toEqual(["a", "b"]);
    expect(
      withOrder([batch("x", 9), batch("y", 3)]).batches.map(
        (item) => item.order,
      ),
    ).toEqual([1, 2]);
    expect(newBatchId("Core libraries", [batch("core-libraries", 1)])).toBe(
      "core-libraries-2",
    );
    expect(newStepId([step("step-1"), step("step-3")])).toBe("step-4");
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  });

  it("assigns an item to one Step and prevents a duplicate in its batch", () => {
    const original = batch("a", 1, [step("first"), step("second")]);
    const once = assignItem(original, "first", { type: "mod", id: "sodium" });
    expect(once.steps[0]?.itemRefs).toEqual([{ type: "mod", id: "sodium" }]);
    expect(assignItem(once, "second", { type: "mod", id: "sodium" })).toBe(
      once,
    );
    expect(
      unassignItem(once, "first", { type: "mod", id: "sodium" }).steps[0]
        ?.itemRefs,
    ).toEqual([]);
  });

  it("moves a mod between Steps without duplicating it in the batch", () => {
    const original = batch("a", 1, [
      step("first", [{ type: "mod", id: "sodium" }]),
      step("second", [{ type: "mod", id: "lithium" }]),
    ]);

    expect(
      moveItemToStep(original, "first", "second", {
        type: "mod",
        id: "sodium",
      }).steps.map((item) => item.itemRefs),
    ).toEqual([
      [],
      [
        { type: "mod", id: "lithium" },
        { type: "mod", id: "sodium" },
      ],
    ]);
  });

  it("renames, removes, and resolves mods across Steps", () => {
    const file = withOrder([
      batch("a", 1, [
        step("first", [{ type: "mod", id: "old" }]),
        step("second", [{ type: "mod", id: "new" }]),
      ]),
      batch("b", 2, [step("only", [{ type: "mod", id: "old" }])]),
    ]);
    const renamed = renameModInBatches(file, "old", "new");
    expect(
      renamed.batches.map((item) =>
        item.steps.flatMap((item) => item.itemRefs),
      ),
    ).toEqual([[{ type: "mod", id: "new" }], [{ type: "mod", id: "new" }]]);
    expect(
      removeModsFromBatches(renamed, ["new"]).batches[0]?.steps.flatMap(
        (item) => item.itemRefs,
      ),
    ).toEqual([]);
    const result = batchMods(
      batch("c", 1, [
        step("one", [
          { type: "mod", id: "x" },
          { type: "mod", id: "gone" },
        ]),
        step("two", [{ type: "mod", id: "y" }]),
      ]),
      [mod("x"), mod("y")],
    );
    expect(result.mods.map((item) => item.id)).toEqual(["x", "y"]);
    expect(result.missing).toEqual(["gone"]);
  });
});

describe("drafts and the build plan", () => {
  const published = collectionSchema.parse({
    modpack: modpackJson,
    mods: [mod("x")],
    batches: {
      version: 2,
      batches: [
        batch("core", 1, [step("install", [{ type: "mod", id: "x" }])]),
      ],
    },
  });

  it("gives older drafts without a plan the published plan", () => {
    const oldDraft = JSON.stringify({
      modpack: { ...published.modpack, name: "Edited" },
      mods: published.mods,
    });
    expect(parseDraft(oldDraft, published)?.batches).toEqual(published.batches);
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
});
