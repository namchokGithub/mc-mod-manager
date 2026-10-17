import { describe, expect, it } from "vitest";
import type { Mod } from "../schema";
import {
  candidateToMod,
  findBatchDuplicates,
  findPackDuplicate,
  sha1Hex,
  type ImportCandidate,
} from "./importing";
import {
  filenameHints,
  parseFabricModJson,
  parseJar,
  parseManifest,
  parseModsToml,
} from "./metadata";
import { parseToml } from "./toml";
import { listEntries, readEntry } from "./zip";

type Entry = {
  name: string;
  data: string;
  deflate?: boolean;
  encrypted?: boolean;
};

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Builds a real ZIP archive. CRCs are left at zero because the reader does not check them. */
async function makeJar(entries: Entry[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const raw = encoder.encode(entry.data);
    const body = entry.deflate ? await deflateRaw(raw) : raw;
    const method = entry.deflate ? 8 : 0;
    const flags = entry.encrypted ? 1 : 0;
    const local = new DataView(new ArrayBuffer(30 + name.length + body.length));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, flags, true);
    local.setUint16(8, method, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    const localBytes = new Uint8Array(local.buffer);
    localBytes.set(name, 30);
    localBytes.set(body, 30 + name.length);
    const central = new DataView(new ArrayBuffer(46 + name.length));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(8, flags, true);
    central.setUint16(10, method, true);
    central.setUint32(20, body.length, true);
    central.setUint32(24, raw.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    const centralBytes = new Uint8Array(central.buffer);
    centralBytes.set(name, 46);
    locals.push(localBytes);
    centrals.push(centralBytes);
    offset += localBytes.length;
  }
  const directorySize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);
  return new Blob([
    ...locals,
    ...centrals,
    new Uint8Array(end.buffer),
  ] as BlobPart[]);
}

const fabricJson = JSON.stringify({
  schemaVersion: 1,
  id: "sodium",
  version: "0.5.3+mc1.20.1",
  name: "Sodium",
  description: "Rendering engine",
  environment: "client",
  contact: { homepage: "https://modrinth.com/mod/sodium", issues: "x" },
  depends: { fabricloader: ">=0.12", minecraft: "1.20.1", "fabric-api": "*" },
  suggests: { iris: "*" },
  breaks: { optifabric: "*" },
});

const neoforgeToml = `
modLoader = "javafml" # comment
loaderVersion = "[1,)"
license = 'MIT'

[[mods]]
modId = "jei"
version = "\${file.jarVersion}"
displayName = "Just Enough Items"
displayURL = "https://www.curseforge.com/minecraft/mc-mods/jei"
description = '''
Item and recipe viewer
'''

[[dependencies.jei]]
modId = "neoforge"
type = "required"
versionRange = "[20.4,)"

[[dependencies.jei]]
modId = "minecraft"
type = "required"
versionRange = "[1.20.4,1.21)"

[[dependencies.jei]]
modId = "emi"
type = "incompatible"
`;

const forgeToml = `
modLoader="javafml"
[[mods]]
modId="create"
version="0.5.1.f"
displayName="Create"
[[dependencies.create]]
    modId="forge"
    mandatory=true
    versionRange="[47,)"
[[dependencies.create]]
    modId="flywheel"
    mandatory=true
[[dependencies.create]]
    modId="jei"
    mandatory=false
`;

describe("TOML subset", () => {
  it("parses tables, arrays of tables, strings, and values", () => {
    const doc = parseToml(`
title = "a \\"quoted\\" \\u0041"
[server]
port = 8_080
enabled = true
tags = ["a", 'b',
  "c", # trailing comment
]
point = { x = 1, y = 2 }
"quoted.key" = 1
dotted.key = "yes"
`);
    expect(doc).toEqual({
      title: 'a "quoted" A',
      server: {
        port: 8080,
        enabled: true,
        tags: ["a", "b", "c"],
        point: { x: 1, y: 2 },
        "quoted.key": 1,
        dotted: { key: "yes" },
      },
    });
  });

  it("reports malformed input with a line number", () => {
    expect(() => parseToml('a = "unterminated\nb = 1')).toThrow(/line 1/);
    expect(() => parseToml("a = 1\na = 2")).toThrow("Duplicate key");
    expect(() => parseToml("[[mods]\nx=1")).toThrow("Expected ]]");
  });
});

describe("metadata parsers", () => {
  it("reads fabric.mod.json and separates platform requirements", () => {
    const parsed = parseFabricModJson(fabricJson);
    expect(parsed).toMatchObject({
      modId: "sodium",
      name: "Sodium",
      version: "0.5.3+mc1.20.1",
      side: "client",
      loaders: ["fabric"],
      homepage: "https://modrinth.com/mod/sodium",
      minecraftRange: "1.20.1",
      dependencies: [
        { modId: "fabric-api", kind: "required", versionRange: "*" },
        { modId: "iris", kind: "optional", versionRange: "*" },
        { modId: "optifabric", kind: "incompatible", versionRange: "*" },
      ],
    });
  });

  it("treats an unfilled version placeholder as missing", () => {
    const parsed = parseFabricModJson(
      JSON.stringify({ id: "x", version: "${version}" }),
    );
    expect(parsed.version).toBeUndefined();
    expect(parsed.warnings[0]).toContain("never filled in");
  });

  it("rejects invalid fabric.mod.json", () => {
    expect(() => parseFabricModJson("{ nope")).toThrow("not valid JSON");
    expect(() => parseFabricModJson("[]")).toThrow("not an object");
  });

  it("reads neoforge.mods.toml and resolves the jar version from the manifest", () => {
    const parsed = parseModsToml(
      neoforgeToml,
      "neoforge.mods.toml",
      parseManifest(
        "Manifest-Version: 1.0\r\nImplementation-Version: 17.3.0.\r\n 49\r\n",
      ),
    );
    expect(parsed).toMatchObject({
      modId: "jei",
      name: "Just Enough Items",
      version: "17.3.0.49",
      description: "Item and recipe viewer",
      loaders: ["neoforge"],
      minecraftRange: "[1.20.4,1.21)",
      dependencies: [{ modId: "emi", kind: "incompatible" }],
    });
  });

  it("reads Forge mods.toml mandatory flags", () => {
    const parsed = parseModsToml(forgeToml, "mods.toml");
    expect(parsed.loaders).toEqual(["forge"]);
    expect(parsed.dependencies).toEqual([
      { modId: "flywheel", kind: "required", versionRange: undefined },
      { modId: "jei", kind: "optional", versionRange: undefined },
    ]);
  });

  it("warns when the jar version placeholder cannot be resolved", () => {
    const parsed = parseModsToml(neoforgeToml, "neoforge.mods.toml");
    expect(parsed.version).toBeUndefined();
    expect(parsed.warnings).toContain(
      "The version placeholder could not be resolved.",
    );
  });

  it("rejects mods.toml without a mods entry", () => {
    expect(() => parseModsToml('modLoader="javafml"', "mods.toml")).toThrow(
      "no [[mods]] entry",
    );
  });

  it("derives hints from file names", () => {
    expect(filenameHints("mods/sodium-fabric-0.5.3+mc1.20.1.jar")).toEqual({
      name: "sodium fabric",
      version: "0.5.3+mc1.20.1",
    });
    expect(filenameHints("SomeMod.jar")).toEqual({
      name: "SomeMod",
      version: undefined,
    });
  });
});

describe("JAR reading", () => {
  it("reads stored and deflated entries", async () => {
    const jar = await makeJar([
      { name: "a.txt", data: "stored" },
      { name: "b.txt", data: "deflated ".repeat(50), deflate: true },
    ]);
    const [stored, deflated] = await listEntries(jar);
    if (!stored || !deflated) throw new Error("entries missing");
    const decoder = new TextDecoder();
    expect(decoder.decode(await readEntry(jar, stored))).toBe("stored");
    expect(decoder.decode(await readEntry(jar, deflated))).toBe(
      "deflated ".repeat(50),
    );
  });

  it("extracts Fabric metadata from a jar", async () => {
    const jar = await makeJar([
      { name: "fabric.mod.json", data: fabricJson, deflate: true },
    ]);
    const metadata = await parseJar(jar, "sodium.jar");
    expect(metadata).toMatchObject({
      format: "fabric.mod.json",
      readable: true,
      modId: "sodium",
      loaders: ["fabric"],
    });
  });

  it("prefers the pack loader in multi-loader jars", async () => {
    const jar = await makeJar([
      { name: "fabric.mod.json", data: fabricJson },
      { name: "META-INF/neoforge.mods.toml", data: neoforgeToml },
      { name: "META-INF/MANIFEST.MF", data: "Implementation-Version: 1.0\n" },
    ]);
    const metadata = await parseJar(jar, "multi.jar", "neoforge");
    expect(metadata.format).toBe("neoforge.mods.toml");
    expect(metadata.loaders).toEqual(["neoforge", "fabric"]);
    expect(metadata.warnings.at(-1)).toContain("metadata for neoforge, fabric");
  });

  it("falls back to file name hints without metadata", async () => {
    const jar = await makeJar([{ name: "com/example/Main.class", data: "x" }]);
    const metadata = await parseJar(jar, "cool-mod-1.2.3.jar");
    expect(metadata).toMatchObject({
      format: "filename",
      readable: true,
      name: "cool mod",
      version: "1.2.3",
      loaders: [],
    });
    expect(metadata.warnings.join(" ")).toContain("not verified");
  });

  it("handles files that are not ZIP archives", async () => {
    const metadata = await parseJar(
      new Blob(["not a zip at all, just text"]),
      "fake.jar",
    );
    expect(metadata).toMatchObject({ format: "filename", readable: false });
    expect(metadata.warnings[0]).toContain("not a valid JAR");
  });

  it("handles tiny and truncated files", async () => {
    expect((await parseJar(new Blob(["x"]), "x.jar")).readable).toBe(false);
    const jar = await makeJar([{ name: "fabric.mod.json", data: fabricJson }]);
    const truncated = jar.slice(0, 40);
    expect((await parseJar(truncated, "t.jar")).readable).toBe(false);
  });

  it("reports a malformed metadata file and keeps the file name hints", async () => {
    const jar = await makeJar([{ name: "fabric.mod.json", data: "{ broken" }]);
    const metadata = await parseJar(jar, "broken-2.0.jar");
    expect(metadata.format).toBe("filename");
    expect(metadata.warnings[0]).toContain("fabric.mod.json could not be read");
  });

  it("refuses encrypted entries", async () => {
    const jar = await makeJar([
      { name: "fabric.mod.json", data: fabricJson, encrypted: true },
    ]);
    const metadata = await parseJar(jar, "enc.jar");
    expect(metadata.readable).toBe(false);
    expect(metadata.warnings[0]).toContain("encrypted");
  });

  it("stops inflating entries that exceed the size limit", async () => {
    const jar = await makeJar([
      { name: "big.txt", data: "a".repeat(5000), deflate: true },
    ]);
    const [entry] = await listEntries(jar);
    if (!entry) throw new Error("entry missing");
    // Lie about the size so only the streaming limit can catch it.
    await expect(readEntry(jar, { ...entry, size: 10 }, 1000)).rejects.toThrow(
      "unexpectedly large",
    );
  });

  it("hashes files with SHA-1", async () => {
    expect(await sha1Hex(new Blob(["abc"]))).toBe(
      "a9993e364706816aba3e25717850c26c9cd0d89d",
    );
  });
});

const baseMod: Mod = {
  id: "sodium",
  name: "Sodium",
  version: "",
  category: "Performance",
  tags: [],
  status: "planned",
  side: "client",
  source: "Modrinth",
  sourceUrl: "",
  description: "",
  dependencies: [],
  notes: "Mine",
  imageUrl: "",
};

function candidate(
  overrides: Partial<ImportCandidate["metadata"]> = {},
  extra: Partial<ImportCandidate> = {},
): ImportCandidate {
  return {
    key: overrides.fileName ?? "file.jar",
    metadata: {
      fileName: "file.jar",
      format: "fabric.mod.json",
      readable: true,
      side: null,
      loaders: ["fabric"],
      dependencies: [],
      warnings: [],
      ...overrides,
    },
    ...extra,
  };
}

describe("duplicate detection", () => {
  it("finds duplicates by file hash first", () => {
    const sha1 = "a".repeat(40);
    expect(
      findPackDuplicate(candidate({ modId: "other" }, { sha1 }), [
        { ...baseMod, file: { name: "x.jar", sha1 } },
      ]),
    ).toEqual({ reason: "Same file", modName: "Sodium" });
  });

  it("finds duplicates by mod ID and by name", () => {
    expect(
      findPackDuplicate(candidate({ modId: "sodium" }), [baseMod])?.reason,
    ).toBe("Same mod ID");
    expect(
      findPackDuplicate(candidate({ modId: "x", name: "SODIUM!" }), [baseMod])
        ?.reason,
    ).toBe("Same name");
    expect(
      findPackDuplicate(candidate({ modId: "lithium" }), [baseMod]),
    ).toBeNull();
  });

  it("finds duplicates by Modrinth project after matching", () => {
    const match = {
      project: {
        id: "AANobbMI",
        slug: "s",
        title: "Different",
        description: "",
        author: "",
        iconUrl: "",
        categories: [],
        clientSide: "required",
        serverSide: "unsupported",
        sourceUrl: "",
      },
      version: {
        id: "v",
        projectId: "AANobbMI",
        name: "",
        versionNumber: "1",
        versionType: "release",
        gameVersions: [],
        loaders: [],
        datePublished: "",
        dependencies: [],
      },
    };
    expect(
      findPackDuplicate(candidate({ modId: "zzz" }, { match }), [
        { ...baseMod, modrinth: { projectId: "AANobbMI" } },
      ])?.reason,
    ).toBe("Same Modrinth project");
  });

  it("flags repeated files within one selection", () => {
    const duplicates = findBatchDuplicates([
      candidate({ fileName: "a.jar", modId: "jei" }),
      candidate({ fileName: "b.jar", modId: "jei" }),
      candidate({ fileName: "c.jar", modId: "emi" }),
    ]);
    expect([...duplicates.keys()]).toEqual(["b.jar"]);
    expect(duplicates.get("b.jar")?.modName).toBe("a.jar");
  });
});

describe("converting candidates to mods", () => {
  it("builds a valid unverified entry from local metadata", () => {
    const mod = candidateToMod(
      candidate(
        {
          fileName: "mods/sodium-0.5.jar",
          modId: "sodium",
          name: "Sodium",
          version: "0.5",
          side: "client",
          homepage: "https://example.com",
          dependencies: [
            { modId: "fabric-api", kind: "required" },
            { modId: "iris", kind: "optional" },
          ],
        },
        { sha1: "b".repeat(40), match: null },
      ),
      [baseMod],
    );
    expect(mod).toMatchObject({
      id: "sodium-2",
      name: "Sodium",
      version: "0.5",
      category: "Uncategorized",
      tags: ["Fabric"],
      status: "planned",
      side: "client",
      source: "Other",
      sourceUrl: "https://example.com",
      dependencies: ["fabric-api"],
      notes: "Imported from sodium-0.5.jar.",
      file: { name: "sodium-0.5.jar", sha1: "b".repeat(40), modId: "sodium" },
    });
    expect(mod.modrinth).toBeUndefined();
  });

  it("uses the file name when no metadata exists", () => {
    const mod = candidateToMod(
      candidate({ fileName: "Mystery.jar", format: "filename", loaders: [] }),
      [],
    );
    expect(mod).toMatchObject({ id: "mystery", name: "Mystery", tags: [] });
  });
});
