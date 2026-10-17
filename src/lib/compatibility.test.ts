import { describe, expect, it } from "vitest";
import modpackJson from "../../public/data/modpack.json";
import modsJson from "../../public/data/mods.json";
import {
  checkCompatibility,
  countByStatus,
  findByProject,
  statusLabel,
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
    expect(result.reasons[0]?.message).toContain("1.21.1, not 1.20.1");
  });

  it("flags a loader mismatch with readable names", () => {
    const result = check([mod("a", { loaders: ["forge"] })], {
      ...pack,
      modloader: "NeoForge",
    }).get("a")!;
    expect(result.status).toBe("incompatible");
    expect(result.reasons[0]?.message).toBe(
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
    expect(result.reasons[0]?.message).toContain(
      "without Modrinth or JAR metadata",
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
    expect(result.reasons[0]?.message).toBe(
      "Missing required dependency: Dep.",
    );
  });

  it("flags a required dependency that is disabled", () => {
    const result = check([
      requires("required"),
      mod("dep", {}, { status: "disabled" }),
    ]).get("a")!;
    expect(result.status).toBe("incompatible");
    expect(result.reasons[0]?.message).toContain("disabled in this pack");
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
    expect(results.get("dep")?.reasons[0]?.message).toBe(
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
    expect(result.reasons[0]?.message).toContain("not found");
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

describe("local JAR fallback", () => {
  const neoPack: Modpack = {
    ...pack,
    minecraftVersion: "26.1.2",
    modloader: "NeoForge",
  };
  const jarMod = (
    file: NonNullable<Mod["file"]>,
    id = "jarmod",
    extra: Partial<Mod> = {},
  ) => mod(id, undefined, { source: "CurseForge", file, ...extra });
  const neoforgeJar: NonNullable<Mod["file"]> = {
    name: "jarmod.jar",
    modId: "jarmod",
    format: "neoforge.mods.toml",
    loaders: ["neoforge"],
    minecraftRange: "[26.1,26.2)",
  };

  it("verifies a mod that is not on Modrinth from its JAR metadata", () => {
    expect(check([jarMod(neoforgeJar)], neoPack).get("jarmod")).toMatchObject({
      status: "compatible",
      verification: "jar",
      checks: { minecraft: "pass", loader: "pass", dependencies: "pass" },
    });
  });

  it("flags a Minecraft range or loader the JAR declares against the pack", () => {
    const wrongVersion = check(
      [jarMod({ ...neoforgeJar, minecraftRange: "[1.20.1,1.21)" })],
      neoPack,
    ).get("jarmod")!;
    expect(wrongVersion).toMatchObject({
      status: "incompatible",
      checks: { minecraft: "fail" },
    });
    const fabric = check(
      [
        jarMod({
          ...neoforgeJar,
          format: "fabric.mod.json",
          loaders: ["fabric"],
          minecraftRange: "~26.1",
        }),
      ],
      neoPack,
    ).get("jarmod")!;
    expect(fabric.checks).toEqual({
      minecraft: "pass",
      loader: "fail",
      dependencies: "pass",
    });
  });

  it("stays unknown when the JAR does not declare enough", () => {
    const noRange = check(
      [jarMod({ ...neoforgeJar, minecraftRange: undefined })],
      neoPack,
    ).get("jarmod")!;
    expect(noRange).toMatchObject({
      status: "unknown",
      checks: { minecraft: "unknown", loader: "pass", dependencies: "pass" },
    });
    expect(noRange.reasons[0]?.message).toContain("does not declare");
  });

  it("does not trust a loader guessed from a plain mods.toml", () => {
    const guessed = check(
      [
        jarMod({
          ...neoforgeJar,
          format: "mods.toml",
          loaders: ["forge"],
          loadersInferred: true,
        }),
      ],
      neoPack,
    ).get("jarmod")!;
    expect(guessed.checks.loader).toBe("unknown");
    expect(guessed.status).toBe("unknown");
  });

  it("checks required dependencies by JAR mod ID without failing on unknown IDs", () => {
    const withDeps = {
      ...neoforgeJar,
      dependencies: [{ modId: "geckolib", kind: "required" as const }],
    };
    const missing = check([jarMod(withDeps)], neoPack).get("jarmod")!;
    expect(missing).toMatchObject({
      status: "warning",
      checks: { dependencies: "warn" },
    });
    const present = check(
      [
        jarMod(withDeps),
        jarMod(
          { ...neoforgeJar, name: "g.jar", modId: "geckolib" },
          "geckolib-neo",
        ),
      ],
      neoPack,
    ).get("jarmod")!;
    expect(present.checks.dependencies).toBe("pass");
    const disabled = check(
      [
        jarMod(withDeps),
        jarMod({ ...neoforgeJar, modId: "geckolib" }, "geckolib-neo", {
          status: "disabled",
        }),
      ],
      neoPack,
    ).get("jarmod")!;
    expect(disabled.checks.dependencies).toBe("fail");
  });

  it("flags declared incompatibilities that are present", () => {
    const result = check(
      [
        jarMod({
          ...neoforgeJar,
          dependencies: [{ modId: "optifine", kind: "incompatible" }],
        }),
        jarMod({ ...neoforgeJar, modId: "optifine" }, "optifine"),
      ],
      neoPack,
    ).get("jarmod")!;
    expect(result).toMatchObject({
      status: "incompatible",
      checks: { dependencies: "fail" },
    });
  });

  it("separates file-name guesses from verified metadata", () => {
    const result = check(
      [jarMod({ name: "cool-mod-1.0.jar", format: "filename" })],
      neoPack,
    ).get("jarmod")!;
    expect(result).toMatchObject({
      status: "unknown",
      verification: "filename",
      checks: {
        minecraft: "unknown",
        loader: "unknown",
        dependencies: "unknown",
      },
    });
  });

  it("prefers Modrinth facts over JAR metadata", () => {
    const both = mod(
      "both",
      { gameVersions: ["26.1.2"], loaders: ["neoforge"] },
      {
        file: { ...neoforgeJar, minecraftRange: "[1.20,1.21)" },
      },
    );
    expect(check([both], neoPack).get("both")).toMatchObject({
      status: "compatible",
      verification: "modrinth",
    });
  });

  it("marks manual and pre-metadata imports as unknown, never incompatible", () => {
    expect(check([mod("manual")], neoPack).get("manual")).toMatchObject({
      status: "unknown",
      verification: "manual",
    });
    const old = check(
      [jarMod({ name: "old.jar", modId: "old" }, "old")],
      neoPack,
    ).get("old")!;
    expect(old.status).toBe("unknown");
    expect(old.reasons[0]?.message).toContain("Import the file again");
  });
});

describe("JAR metadata in JSON", () => {
  it("round-trips the optional file fields", () => {
    const withJar = mod("j", undefined, {
      file: {
        name: "j.jar",
        modId: "j",
        format: "mods.toml",
        loaders: ["forge"],
        loadersInferred: true,
        minecraftRange: "[1.20.1,1.21)",
        dependencies: [{ modId: "x", kind: "required", versionRange: "[1,)" }],
      },
    });
    expect(parseJsonFile(JSON.stringify([withJar]), "mods")).toEqual([withJar]);
  });
});

describe("manually entered compatibility", () => {
  const neoPack: Modpack = {
    ...pack,
    minecraftVersion: "26.1.2",
    modloader: "NeoForge",
  };
  const manual = (
    gameVersions: string[],
    loaders: string[],
    extra: Partial<Mod> = {},
  ) =>
    mod("cf", undefined, {
      source: "CurseForge",
      manualCompatibility: { gameVersions, loaders },
      ...extra,
    });

  it("reports a manual match without calling it verified", () => {
    const result = check([manual(["26.1.2"], ["neoforge"])], neoPack).get(
      "cf",
    )!;
    expect(result).toMatchObject({
      status: "compatible",
      verification: "manual",
      checks: { minecraft: "pass", loader: "pass", dependencies: "unknown" },
      checkSources: { minecraft: "manual", loader: "manual" },
    });
    expect(statusLabel(result)).toBe("Manual Match");
  });

  it("reports a manual mismatch for the version or the loader", () => {
    const version = check([manual(["1.20.1"], ["neoforge"])], neoPack).get(
      "cf",
    )!;
    expect(version.checks.minecraft).toBe("fail");
    expect(statusLabel(version)).toBe("Manual Mismatch");
    const loader = check([manual(["26.1.2"], ["fabric"])], neoPack).get("cf")!;
    expect(loader.checks.loader).toBe("fail");
    expect(statusLabel(loader)).toBe("Manual Mismatch");
  });

  it("stays unknown when only part of the data was entered", () => {
    const result = check([manual(["26.1.2"], [])], neoPack).get("cf")!;
    expect(result.status).toBe("unknown");
    expect(result.checks).toMatchObject({
      minecraft: "pass",
      loader: "unknown",
    });
    expect(statusLabel(result)).toBe("Unknown");
  });

  it("keeps dependencies separate from the version check", () => {
    const result = check([manual(["26.1.2"], ["neoforge"])], neoPack).get(
      "cf",
    )!;
    expect(result.checks.dependencies).toBe("unknown");
    expect(result.reasons.some((reason) => reason.level === "unknown")).toBe(
      false,
    );
  });

  it("never lets manual data override Modrinth or JAR metadata", () => {
    const modrinth = mod(
      "m",
      { gameVersions: ["26.1.2"], loaders: ["neoforge"] },
      { manualCompatibility: { gameVersions: ["1.12"], loaders: ["forge"] } },
    );
    expect(check([modrinth], neoPack).get("m")).toMatchObject({
      status: "compatible",
      verification: "modrinth",
    });
    const jar = mod("j", undefined, {
      file: {
        name: "j.jar",
        format: "neoforge.mods.toml",
        loaders: ["neoforge"],
        minecraftRange: "[1.20,1.21)",
      },
      manualCompatibility: { gameVersions: ["26.1.2"], loaders: ["neoforge"] },
    });
    const result = check([jar], neoPack).get("j")!;
    expect(result.checks.minecraft).toBe("fail");
    expect(result.checkSources.minecraft).toBe("jar");
    expect(statusLabel(result)).toBe("Incompatible");
  });

  it("fills gaps in JAR metadata and marks that check as manual", () => {
    const jar = mod("j", undefined, {
      file: {
        name: "j.jar",
        format: "mods.toml",
        loaders: ["forge"],
        loadersInferred: true,
      },
      manualCompatibility: { gameVersions: ["26.1.2"], loaders: ["neoforge"] },
    });
    const result = check([jar], neoPack).get("j")!;
    expect(result).toMatchObject({
      status: "compatible",
      verification: "jar",
      checks: { minecraft: "pass", loader: "pass" },
      checkSources: {
        minecraft: "manual",
        loader: "manual",
        dependencies: "jar",
      },
    });
    expect(statusLabel(result)).toBe("Manual Match");
  });

  it("ignores file-name guesses when manual data exists", () => {
    const result = check(
      [
        manual(["26.1.2"], ["neoforge"], {
          file: { name: "x-26.1.2.jar", format: "filename" },
        }),
      ],
      neoPack,
    ).get("cf")!;
    expect(result.verification).toBe("manual");
  });

  it("round-trips through JSON import", () => {
    const entry = manual(["26.1.2", "26.1.1"], ["neoforge"], { notes: "Keep" });
    expect(parseJsonFile(JSON.stringify([entry]), "mods")).toEqual([entry]);
  });
});
