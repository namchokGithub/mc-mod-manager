import { describe, expect, it } from "vitest";
import modpack from "../../public/data/modpack.json";
import mods from "../../public/data/mods.json";
import { collectionSchema, parseJsonFile } from "./schema";
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

  it("accepts a hero image stored under public/assets", () => {
    const parsed = parseJsonFile(
      JSON.stringify({
        ...modpack,
        heroImageUrl:
          "public/assets/theme/winter_slime_adventure_in_the_snow.png",
      }),
      "modpack",
    );
    expect("heroImageUrl" in parsed && parsed.heroImageUrl).toBe(
      "public/assets/theme/winter_slime_adventure_in_the_snow.png",
    );
  });

  it("rejects a hero image path that escapes public/assets", () => {
    expect(() =>
      parseJsonFile(
        JSON.stringify({
          ...modpack,
          heroImageUrl: "public/assets/../secret.png",
        }),
        "modpack",
      ),
    ).toThrow("public/assets");
  });

  it("rejects invalid JSON without returning replacement data", () => {
    expect(() => parseJsonFile("{", "mods")).toThrow("not valid JSON");
  });

  it("ignores a corrupt saved draft", () => {
    expect(
      readDraft({ getItem: (key) => (key === DRAFT_KEY ? "{bad" : null) }),
    ).toBeNull();
  });
});
