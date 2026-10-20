import { describe, expect, it } from "vitest";
import { duplicateMod } from "./mods";
import { modSchema, type Mod } from "./schema";

const original: Mod = {
  id: "animal-garden-capybara",
  name: "Animal Garden - Capybara",
  version: "1.0.0",
  category: "Mobs",
  tags: [],
  status: "installed",
  side: "both",
  source: "CurseForge",
  sourceUrl: "https://www.curseforge.com/minecraft/mc-mods/capybara",
  description: "Adds an animal",
  dependencies: ["aquarius-libs"],
  notes: "",
  imageUrl: "https://example.com/capybara.png",
  modrinth: { projectId: "capybara-project", versionId: "capybara-version" },
  file: { name: "capybara.jar", sha1: "a".repeat(40) },
  manualCompatibility: { gameVersions: ["1.21.1"], loaders: ["neoforge"] },
  manualVerification: {
    source: "curseforge",
    version: "1.0.0",
    gameVersions: ["1.21.1"],
    loaders: ["neoforge"],
    evidenceUrl: "https://www.curseforge.com/minecraft/mc-mods/capybara",
    verifiedAt: "2026-10-18T00:00:00.000Z",
  },
  ignoredDependencies: [{ id: "other-project", reason: "Not needed" }],
  dependencyLinks: [{ id: "aquarius-libs", modId: "aquarius-libs" }],
  addedAt: "2026-10-18T00:00:00.000Z",
};

describe("duplicating a mod", () => {
  it("creates a new editable mod without the original project's identity", () => {
    const copy = duplicateMod(original, [original]);

    expect(modSchema.safeParse(copy).success).toBe(true);
    expect(copy).toMatchObject({
      id: "animal-garden-capybara-2",
      name: "Animal Garden - Capybara (copy)",
      category: "Mobs",
      status: "planned",
      description: "Adds an animal",
    });
    expect(copy.modrinth).toBeUndefined();
    expect(copy.file).toBeUndefined();
    expect(copy.manualCompatibility).toBeUndefined();
    expect(copy.manualVerification).toBeUndefined();
    expect(copy.ignoredDependencies).toBeUndefined();
    expect(copy.dependencyLinks).toBeUndefined();
    expect(copy.dependencies).toEqual([]);
    expect(copy.addedAt).toBeUndefined();
    expect(copy.sourceUrl).toBe("");
    expect(copy.imageUrl).toBe("");
    expect(copy.version).toBe("");
  });
});
