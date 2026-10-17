import { describe, expect, it } from "vitest";
import modpackJson from "../../public/data/modpack.json";
import modsJson from "../../public/data/mods.json";
import {
  checkCompatibility,
  countByStatus,
  findByProject,
} from "./compatibility";
import {
  collectionSchema,
  parseJsonFile,
  type Mod,
  type ModrinthMeta,
  type Modpack,
} from "./schema";

const pack: Modpack = {
  name: "Test",
  description: "",
  version: "1",
  minecraftVersion: "1.20.1",
  modloader: "Fabric",
  modloaderVersion: "",
  author: "",
  updatedAt: "2026-10-17",
  heroImageUrl: "",
};

function mod(
  id: string,
  modrinth?: Partial<ModrinthMeta>,
  extra: Partial<Mod> = {},
): Mod {
  return {
    id,
    name: id.toUpperCase(),
    version: "",
    category: "Test",
    tags: [],
    status: "installed",
    side: "both",
    source: "Modrinth",
    sourceUrl: "",
    description: "",
    dependencies: [],
    notes: "",
    imageUrl: "",
    ...(modrinth && {
      modrinth: {
        projectId: `p-${id}`,
        versionId: `v-${id}`,
        gameVersions: ["1.20.1"],
        loaders: ["fabric"],
        dependencies: [],
        ...modrinth,
      },
    }),
    ...extra,
  };
}

const check = (
  mods: Mod[],
  modpack = pack,
  live?: Parameters<typeof checkCompatibility>[2],
) => checkCompatibility(mods, modpack, live);

describe("version and loader checks", () => {
  it("marks a matching version as compatible", () => {
    expect(check([mod("a", {})]).get("a")).toMatchObject({
      status: "compatible",
      source: "stored",
    });
  });

  it("flags a Minecraft version mismatch", () => {
    const result = check([mod("a", { gameVersions: ["1.21.1"] })]).get("a")!;
    expect(result.status).toBe("incompatible");
    expect(result.reasons[0].message).toContain("1.21.1, not 1.20.1");
  });

  it("flags a loader mismatch with readable names", () => {
    const result = check([mod("a", { loaders: ["forge"] })], {
      ...pack,
      modloader: "NeoForge",
    }).get("a")!;
    expect(result.status).toBe("incompatible");
    expect(result.reasons[0].message).toBe(
      "Selected version is for Forge, not NeoForge.",
    );
  });

  it("warns instead of failing for Fabric mods on Quilt", () => {
    expect(
      check([mod("a", {})], { ...pack, modloader: "Quilt" }).get("a")?.status,
    ).toBe("warning");
  });

  it("is unknown when the pack version or loader is missing or unrecognized", () => {
    expect(
      check([mod("a", {})], { ...pack, minecraftVersion: "" }).get("a")?.status,
    ).toBe("unknown");
    expect(
      check([mod("a", {})], { ...pack, modloader: "Rift" }).get("a")?.status,
    ).toBe("unknown");
  });
});

describe("missing metadata", () => {
  it("never marks a manual mod as compatible", () => {
    const result = check([mod("manual")]).get("manual")!;
    expect(result).toMatchObject({ status: "unknown", source: "none" });
    expect(result.reasons[0].message).toContain(
      "without Modrinth version metadata",
    );
  });

  it("is unknown when a project is linked but no version is selected", () => {
    const result = check([
      mod("a", {
        versionId: undefined,
        gameVersions: undefined,
        loaders: undefined,
      }),
    ]).get("a")!;
    expect(result.status).toBe("unknown");
  });

  it("is unknown when the stored snapshot is incomplete", () => {
    expect(check([mod("a", { loaders: undefined })]).get("a")?.status).toBe(
      "unknown",
    );
  });

  it("skips disabled and removed mods", () => {
    const results = check([
      mod("a", {}, { status: "disabled" }),
      mod("b", {}, { status: "removed" }),
    ]);
    expect(results.size).toBe(0);
  });
});

describe("dependencies", () => {
  const requires = (
    type: "required" | "optional" | "incompatible" | "embedded",
    projectId: string | null = "p-dep",
  ) =>
    mod("a", {
      dependencies: [{ projectId, versionId: null, type, name: "Dep" }],
    });

  it("passes when a required dependency is in the pack", () => {
    expect(check([requires("required"), mod("dep", {})]).get("a")?.status).toBe(
      "compatible",
    );
  });

  it("flags a missing required dependency", () => {
    const result = check([requires("required")]).get("a")!;
    expect(result.status).toBe("incompatible");
    expect(result.reasons[0].message).toBe("Missing required dependency: Dep.");
  });

  it("flags a required dependency that is disabled", () => {
    const result = check([
      requires("required"),
      mod("dep", {}, { status: "disabled" }),
    ]).get("a")!;
    expect(result.status).toBe("incompatible");
    expect(result.reasons[0].message).toContain("disabled in this pack");
  });

  it("warns when a manual mod only matches by name", () => {
    const result = check([
      requires("required"),
      mod("dep", undefined, { name: "Dep" }),
    ]).get("a")!;
    expect(result.status).toBe("warning");
  });

  it("does not treat a missing optional dependency as missing", () => {
    const result = check([requires("optional")]).get("a")!;
    expect(result.status).toBe("compatible");
    expect(result.reasons).toEqual([
      { level: "info", message: "Optional dependency Dep is not in the pack." },
    ]);
  });

  it("ignores embedded dependencies", () => {
    expect(check([requires("embedded")]).get("a")?.status).toBe("compatible");
  });

  it("flags declared incompatibilities on both mods", () => {
    const results = check([requires("incompatible"), mod("dep", {})]);
    expect(results.get("a")?.status).toBe("incompatible");
    expect(results.get("dep")?.reasons[0].message).toBe(
      "A declares itself incompatible with this mod.",
    );
  });

  it("allows an incompatible project that is not in the pack", () => {
    expect(check([requires("incompatible")]).get("a")?.status).toBe(
      "compatible",
    );
  });

  it("warns about a required dependency without a project ID", () => {
    expect(check([requires("required", null)]).get("a")?.status).toBe(
      "warning",
    );
  });
});

describe("duplicates and live data", () => {
  it("warns about duplicate Modrinth projects", () => {
    const results = check([
      mod("a", { projectId: "same" }),
      mod("b", { projectId: "same" }),
    ]);
    expect(results.get("a")?.status).toBe("warning");
    expect(countByStatus(results)).toEqual({
      compatible: 0,
      warning: 2,
      incompatible: 0,
      unknown: 0,
    });
    expect(findByProject([mod("a", { projectId: "same" })], "same")?.id).toBe(
      "a",
    );
    expect(
      findByProject([mod("a", { projectId: "same" })], "same", "a"),
    ).toBeUndefined();
  });

  it("prefers live metadata over the stored snapshot", () => {
    const live = new Map([
      [
        "v-a",
        { gameVersions: ["1.21.1"], loaders: ["fabric"], dependencies: [] },
      ],
    ]);
    expect(check([mod("a", {})], pack, live).get("a")).toMatchObject({
      status: "incompatible",
      source: "live",
    });
  });

  it("warns when the selected version no longer exists", () => {
    const result = check([mod("a", {})], pack, new Map([["v-a", null]])).get(
      "a",
    )!;
    expect(result.status).toBe("warning");
    expect(result.reasons[0].message).toContain("not found");
  });

  it("does not modify the mods", () => {
    const mods = [mod("a", { gameVersions: ["1.12"] })];
    const before = JSON.stringify(mods);
    check(mods);
    expect(JSON.stringify(mods)).toBe(before);
  });
});

describe("schema backward compatibility", () => {
  it("accepts the published files without Modrinth fields", () => {
    expect(
      collectionSchema.safeParse({ modpack: modpackJson, mods: modsJson })
        .success,
    ).toBe(true);
  });

  it("round-trips mods with Modrinth metadata through import", () => {
    const linked = mod("a", {
      dependencies: [
        { projectId: "p", versionId: null, type: "required", name: "P" },
      ],
      syncedAt: "2026-10-17T00:00:00Z",
    });
    expect(parseJsonFile(JSON.stringify([linked]), "mods")).toEqual([linked]);
  });

  it("rejects invalid Modrinth metadata", () => {
    expect(() =>
      parseJsonFile(JSON.stringify([mod("a", { projectId: "" })]), "mods"),
    ).toThrow();
    expect(() =>
      parseJsonFile(
        JSON.stringify([
          mod("a", {
            dependencies: [
              { projectId: "p", versionId: null, type: "weird" as "required" },
            ],
          }),
        ]),
        "mods",
      ),
    ).toThrow();
  });
});
