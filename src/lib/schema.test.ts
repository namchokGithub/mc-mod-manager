import { describe, expect, it } from "vitest";
import modpack from "../../public/data/modpack.json";
import mods from "../../public/data/mods.json";
import { collectionSchema, parseJsonFile } from "./schema";
import { filterMods, uniqueId } from "./mods";
import { DRAFT_KEY, readDraft } from "./storage";

describe("collection data", () => {
  it("accepts the published sample", () => {
    expect(collectionSchema.safeParse({ modpack, mods }).success).toBe(true);
  });

  it("rejects duplicate IDs on import", () => {
    expect(() =>
      parseJsonFile(JSON.stringify([mods[0], mods[0]]), "mods"),
    ).toThrow("Duplicate mod ID");
  });

  it("rejects unsafe external URLs", () => {
    expect(() =>
      parseJsonFile(
        JSON.stringify({ ...modpack, heroImageUrl: "javascript:alert(1)" }),
        "modpack",
      ),
    ).toThrow("http or https");
  });

  it("rejects invalid JSON without returning replacement data", () => {
    expect(() => parseJsonFile("{", "mods")).toThrow("not valid JSON");
  });

  it("ignores a corrupt saved draft", () => {
    expect(
      readDraft({ getItem: (key) => (key === DRAFT_KEY ? "{bad" : null) }),
    ).toBeNull();
  });

  it("filters descriptions and creates unique IDs", () => {
    const parsed = collectionSchema.parse({ modpack, mods });
    expect(
      filterMods(parsed.mods, {
        query: "shader",
        category: "",
        status: "",
        side: "",
        sort: "az",
      }).map((mod) => mod.id),
    ).toEqual(["iris"]);
    expect(uniqueId("Sodium", parsed.mods)).toBe("sodium-2");
  });
});
