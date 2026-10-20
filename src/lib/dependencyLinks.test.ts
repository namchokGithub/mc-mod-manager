import { describe, expect, it } from "vitest";
import { withOrder } from "./batches";
import { checkCompatibility } from "./compatibility";
import {
  applyDependencyLinks,
  matchKey,
  renameModInLinks,
  suggestDependencyLinks,
} from "./dependencyLinks";
import { batchDependencyOverview } from "./dependencyOverview";
import { serializeJson } from "./json";
import { quickAddMods } from "./quickAdd";
import { parseJsonFile, type Mod, type Modpack } from "./schema";

const pack: Modpack = {
  name: "Pack",
  description: "",
  version: "",
  minecraftVersion: "26.1.2",
  modloader: "NeoForge",
  modloaderVersion: "",
  author: "",
  updatedAt: "2026-10-18",
  heroImageUrl: "",
};

const [base] = quickAddMods(["Base"], []);
// Imported from a JAR: it declares the loader mod ID "sophisticatedcore".
const backpacks: Mod = {
  ...base!,
  id: "sophisticated-backpacks",
  name: "Sophisticated Backpacks",
  file: {
    name: "sophisticatedbackpacks.jar",
    modId: "sophisticatedbackpacks",
    format: "neoforge.mods.toml",
    loaders: ["neoforge"],
    minecraftRange: "[26.1,)",
    dependencies: [{ modId: "sophisticatedcore", kind: "required" }],
  },
};
// Added from Modrinth: ID and slug "sophisticated-core", no JAR mod ID.
const core: Mod = {
  ...base!,
  id: "sophisticated-core",
  name: "Sophisticated Core",
  modrinth: {
    projectId: "CORE",
    slug: "sophisticated-core",
    versionId: "v1",
    gameVersions: ["26.1.2"],
    loaders: ["neoforge"],
    dependencies: [],
  },
};

const depsCheck = (mods: Mod[]) =>
  checkCompatibility(mods, pack).get("sophisticated-backpacks")!;

describe("matching dependencies from the list", () => {
  it("normalizes case, spaces, and punctuation", () => {
    expect(matchKey("Sophisticated Core")).toBe(matchKey("sophisticated_core"));
    expect(matchKey("sophisticated-core")).toBe("sophisticatedcore");
  });

  it("suggests the one mod in the list that provides it", () => {
    expect(depsCheck([backpacks, core]).checks.dependencies).toBe("warn");
    expect(suggestDependencyLinks(backpacks, [backpacks, core])).toEqual([
      {
        dependency: {
          id: "sophisticatedcore",
          name: "sophisticatedcore",
          kind: "required",
          source: "jar",
        },
        provider: core,
        ignored: false,
      },
    ]);
  });

  it("does not suggest exact matches, ambiguous matches, or links that exist", () => {
    const exact = {
      ...core,
      file: { name: "c.jar", modId: "sophisticatedcore" },
    };
    expect(suggestDependencyLinks(backpacks, [backpacks, exact])).toEqual([]);
    const twin = { ...core, id: "sophisticated_core", name: "Other" };
    expect(suggestDependencyLinks(backpacks, [backpacks, core, twin])).toEqual(
      [],
    );
    const linked = applyDependencyLinks(backpacks, [
      { id: "sophisticatedcore", modId: "sophisticated-core" },
    ]);
    expect(suggestDependencyLinks(linked, [linked, core])).toEqual([]);
  });

  it("flags a dependency marked not needed that the list actually has", () => {
    const ignored: Mod = {
      ...backpacks,
      ignoredDependencies: [{ id: "sophisticatedcore", reason: "x" }],
    };
    expect(suggestDependencyLinks(ignored, [ignored, core])[0]?.ignored).toBe(
      true,
    );
  });
});

describe("linked dependencies", () => {
  const linked = applyDependencyLinks(
    {
      ...backpacks,
      ignoredDependencies: [{ id: "sophisticatedcore", reason: "workaround" }],
    },
    [{ id: "sophisticatedcore", modId: "sophisticated-core" }],
  );

  it("replace the not-needed workaround", () => {
    expect(linked.ignoredDependencies).toBeUndefined();
    expect(linked.dependencyLinks).toEqual([
      { id: "sophisticatedcore", modId: "sophisticated-core" },
    ]);
  });

  it("resolve in the checker and the dependency overview", () => {
    const result = depsCheck([linked, core]);
    expect(result.checks.dependencies).toBe("pass");
    expect(result.status).toBe("compatible");
    const plan = withOrder([
      {
        id: "b",
        name: "B",
        description: "",
        order: 1,
        steps: [
          {
            id: "install",
            name: "Install",
            description: "",
            done: false,
            itemRefs: ["sophisticated-backpacks", "sophisticated-core"].map(
              (id) => ({ type: "mod" as const, id }),
            ),
          },
        ],
      },
    ]);
    const entry = batchDependencyOverview("b", plan, [linked, core]).mods[0]
      ?.entries[0];
    expect(entry).toMatchObject({
      status: "resolved",
      linked: true,
      label: "Sophisticated Core",
    });
  });

  it("warn again when the linked mod is removed or disabled", () => {
    expect(depsCheck([linked]).checks.dependencies).toBe("fail");
    expect(depsCheck([linked]).reasons[0]?.message).toContain(
      "no longer in the mod list",
    );
    expect(
      depsCheck([linked, { ...core, status: "disabled" }]).reasons[0]?.message,
    ).toContain("disabled");
    const plan = withOrder([
      {
        id: "b",
        name: "B",
        description: "",
        order: 1,
        steps: [
          {
            id: "install",
            name: "Install",
            description: "",
            done: false,
            itemRefs: ["sophisticated-backpacks"].map((id) => ({
              type: "mod" as const,
              id,
            })),
          },
        ],
      },
    ]);
    expect(
      batchDependencyOverview("b", plan, [linked]).mods[0]?.entries[0]?.status,
    ).toBe("missing");
  });

  it("keep cross-batch warnings", () => {
    const plan = withOrder([
      {
        id: "a",
        name: "A",
        description: "",
        order: 1,
        steps: [
          {
            id: "install",
            name: "Install",
            description: "",
            done: false,
            itemRefs: ["sophisticated-backpacks"].map((id) => ({
              type: "mod" as const,
              id,
            })),
          },
        ],
      },
      {
        id: "b",
        name: "B",
        description: "",
        order: 2,
        steps: [
          {
            id: "install",
            name: "Install",
            description: "",
            done: false,
            itemRefs: ["sophisticated-core"].map((id) => ({
              type: "mod" as const,
              id,
            })),
          },
        ],
      },
    ]);
    expect(
      batchDependencyOverview("a", plan, [linked, core]).mods[0]?.entries[0]
        ?.laterOnly,
    ).toBe(true);
  });

  it("follow a renamed mod ID and survive JSON", () => {
    const [renamed] = renameModInLinks([linked], "sophisticated-core", "core");
    expect(renamed?.dependencyLinks?.[0]?.modId).toBe("core");
    const parsed = parseJsonFile(
      serializeJson([linked, core]),
      "mods",
    ) as Mod[];
    expect(parsed[0]?.dependencyLinks).toEqual(linked.dependencyLinks);
  });
});
