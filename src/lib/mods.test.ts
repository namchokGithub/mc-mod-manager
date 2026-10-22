import { describe, expect, it } from "vitest";
import {
  duplicateMod,
  filterModsByStatuses,
  formatPlainTextModList,
  matchesSearchText,
  updateSelectedVisibleModStatuses,
} from "./mods";
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

describe("mod search text", () => {
  it("matches apostrophe, dash, and whitespace variants in a mod name", () => {
    const name = "YUNG's Better Strongholds";

    expect(matchesSearchText(name, "YUNG’s Better Strongholds")).toBe(true);
    expect(matchesSearchText(name, "yungs-better-strongholds")).toBe(true);
    expect(matchesSearchText(name, "  Better   Strongholds ")).toBe(true);
    expect(matchesSearchText(name, "Better Dungeons")).toBe(false);
  });
});

describe("plain-text mod export", () => {
  it("lists each selected mod's name, version, and URL with fallbacks", () => {
    expect(
      formatPlainTextModList([
        original,
        {
          ...original,
          id: "missing",
          name: "Missing details",
          version: "",
          sourceUrl: "",
        },
      ]),
    ).toBe(
      "Animal Garden - Capybara | v1.0.0 | https://www.curseforge.com/minecraft/mc-mods/capybara\nMissing details | — | —",
    );
  });
});

describe("multi-status filtering", () => {
  it("keeps mods matching any selected status and leaves the list unchanged without one", () => {
    const mods = [
      { ...original, id: "interested", status: "interested" as const },
      { ...original, id: "testing", status: "testing" as const },
      { ...original, id: "installed", status: "installed" as const },
    ];

    expect(
      filterModsByStatuses(mods, ["interested", "installed"]).map(
        (mod) => mod.id,
      ),
    ).toEqual(["interested", "installed"]);
    expect(filterModsByStatuses(mods, [])).toBe(mods);
  });
});

describe("bulk status updates", () => {
  it("updates only mods that are both selected and visible in the current filters", () => {
    const mods = [
      { ...original, id: "visible-selected", status: "planned" as const },
      { ...original, id: "hidden-selected", status: "planned" as const },
      { ...original, id: "visible-unselected", status: "planned" as const },
    ];

    const result = updateSelectedVisibleModStatuses(
      mods,
      new Set(["visible-selected", "hidden-selected"]),
      new Set(["visible-selected", "visible-unselected"]),
      "testing",
    );

    expect(result.map((mod) => [mod.id, mod.status])).toEqual([
      ["visible-selected", "testing"],
      ["hidden-selected", "planned"],
      ["visible-unselected", "planned"],
    ]);
  });
});
