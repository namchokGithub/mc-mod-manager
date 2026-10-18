import { describe, expect, it } from "vitest";
import { mergeCandidateIntoMod, type ImportCandidate } from "./jar/importing";
import { serializeJson } from "./json";
import { mergeModrinthIntoMod } from "./modrinth/mapping";
import { filterMods, stampSavedMod, withAddedAt } from "./mods";
import { quickAddMods } from "./quickAdd";
import { modSchema, parseJsonFile, type Mod } from "./schema";

const now = new Date("2026-10-18T10:00:00.000Z");
const earlier = "2026-01-02T03:04:05.000Z";
const [a, b, c] = quickAddMods(["Alpha", "Beta", "Gamma"], []);
const old: Mod = {
  ...b!,
  addedAt: earlier,
  status: "testing",
  dependencies: ["alpha"],
  manualCompatibility: { gameVersions: ["26.1.2"], loaders: ["neoforge"] },
};

describe("schema", () => {
  it("accepts mods with and without addedAt, and rejects bad values", () => {
    expect(modSchema.safeParse(a).success).toBe(true);
    expect(modSchema.safeParse(old).success).toBe(true);
    expect(modSchema.safeParse({ ...a, addedAt: "yesterday" }).success).toBe(
      false,
    );
  });
});

describe("backfill", () => {
  it("gives every missing mod one shared timestamp and keeps existing ones", () => {
    const mods = withAddedAt([a!, old, c!], now);
    expect(mods.map((mod) => mod.addedAt)).toEqual([
      now.toISOString(),
      earlier,
      now.toISOString(),
    ]);
  });

  it("changes nothing else", () => {
    const [filled, kept] = withAddedAt([a!, old], now);
    const { addedAt: _added, ...rest } = filled!;
    void _added;
    expect(rest).toEqual(a);
    expect(kept).toBe(old);
  });

  it("returns the same list when nothing is missing, so a reload writes nothing", () => {
    const once = withAddedAt([a!, old], now);
    expect(withAddedAt(once, new Date("2027-01-01T00:00:00Z"))).toBe(once);
  });
});

describe("saving from the editor", () => {
  it("stamps a new mod with now, even if the form carried a value", () => {
    expect(
      stampSavedMod({ ...a!, addedAt: earlier }, undefined, now).addedAt,
    ).toBe(now.toISOString());
  });

  it("never changes addedAt when an existing mod is edited", () => {
    const edited = stampSavedMod(
      { ...old, name: "Beta 2", version: "2.0", addedAt: undefined },
      old,
      now,
    );
    expect(edited).toMatchObject({ name: "Beta 2", addedAt: earlier });
  });
});

describe("metadata updates and JSON", () => {
  it("keeps addedAt through Modrinth and JAR updates", () => {
    const fromModrinth = mergeModrinthIntoMod(old, {
      ...old,
      version: "3.0",
      modrinth: { projectId: "P", versionId: "V" },
    });
    expect(fromModrinth.addedAt).toBe(earlier);
    const candidate: ImportCandidate = {
      key: "k",
      metadata: {
        fileName: "beta.jar",
        format: "neoforge.mods.toml",
        readable: true,
        modId: "beta",
        version: "3.1",
        description: "",
        side: null,
        loaders: ["neoforge"],
        minecraftRange: "[26.1,)",
        dependencies: [],
        warnings: [],
      },
    };
    expect(mergeCandidateIntoMod(old, candidate).addedAt).toBe(earlier);
  });

  it("survives export and import, and old files without it still load", () => {
    const parsed = parseJsonFile(serializeJson([old, a]), "mods") as Mod[];
    expect(parsed[0]?.addedAt).toBe(earlier);
    expect(parsed[1]?.addedAt).toBeUndefined();
  });
});

describe("sorting by addedAt", () => {
  const filters = {
    query: "",
    category: "",
    status: "",
    side: "",
  } as const;
  const mods: Mod[] = [
    { ...a!, name: "Zed", addedAt: "2026-03-01T00:00:00.000Z" },
    { ...b!, name: "Beta" },
    { ...c!, name: "Alpha", addedAt: "2026-05-01T00:00:00.000Z" },
    {
      ...a!,
      id: "same-day",
      name: "Aardvark",
      addedAt: "2026-03-01T00:00:00.000Z",
    },
  ];
  const names = (sort: "added-desc" | "added-asc") =>
    filterMods(mods, { ...filters, sort }).map((mod) => mod.name);

  it("puts the newest or oldest first, ties by name, undated last", () => {
    expect(names("added-desc")).toEqual(["Alpha", "Aardvark", "Zed", "Beta"]);
    expect(names("added-asc")).toEqual(["Aardvark", "Zed", "Alpha", "Beta"]);
  });

  it("leaves name sorting as it was", () => {
    expect(
      filterMods(mods, { ...filters, sort: "az" }).map((mod) => mod.name),
    ).toEqual(["Aardvark", "Alpha", "Beta", "Zed"]);
  });
});
