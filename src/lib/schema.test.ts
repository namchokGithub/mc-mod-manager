import { describe, expect, it } from "vitest";
import { modpackSchema } from "./schema";

const modpack = {
  name: "Test pack",
  description: "",
  version: "1.0.0",
  minecraftVersion: "26.1.2",
  modloader: "NeoForge",
  modloaderVersion: "",
  author: "",
  updatedAt: "2026-10-23",
  heroImageUrl: "",
};

describe("modpack change log", () => {
  it("keeps the field optional for existing JSON and preserves entered text", () => {
    expect(modpackSchema.parse(modpack).changelog).toBeUndefined();
    expect(
      modpackSchema.parse({
        ...modpack,
        changelog: "Added new dungeon integrations.\n- Fixed loot tables",
      }).changelog,
    ).toBe("Added new dungeon integrations.\n- Fixed loot tables");
  });
});
