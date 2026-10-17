import { describe, expect, it } from "vitest";
import {
  addContentItem,
  emptyContentInput,
  inputFromItem,
  parseContentFile,
  updateContentItem,
  type ContentInput,
} from "./content";
import {
  contentItemCompat,
  contentSourceText,
  contentStatusLabel,
  contentVerificationText,
  findCurseForgeDuplicate,
} from "./contentVerification";
import { nameFromSlug, parseCurseForgeUrl } from "./curseforge";
import { serializeJson } from "./json";
import { buildManualVerification } from "./manualVerification";
import { contentItemFromModrinth } from "./modrinth/contentImport";
import { mapVersion, type ModrinthProject } from "./modrinth/mapping";
import { contentFileSchema, type ContentItem } from "./schema";

const t0 = new Date("2026-10-18T08:00:00.000Z");
const t1 = new Date("2026-10-18T09:00:00.000Z");
const CF = "https://www.curseforge.com/minecraft";
const labels = {
  modrinth: "Modrinth",
  curseforge: "CurseForge",
  manual: "Manual",
  other: "Other",
} as const;

const ok = <T>(
  result: { ok: true; value: T } | { ok: false; error: string },
) => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

describe("CurseForge URLs", () => {
  it.each([
    [`${CF}/texture-packs/example-pack`, "resourcepack", undefined],
    [`${CF}/data-packs/example-pack/files/1234567`, "datapack", "1234567"],
    [`${CF}/shaders/Example-Shader/download/42`, "shader", "42"],
    [
      "https://curseforge.com/minecraft/shaders/example-shader?x=1",
      "shader",
      undefined,
    ],
    [`${CF}/shaders/example-shader/files/all`, "shader", undefined],
  ])("accepts %s", (url, type, fileId) => {
    const link = ok(parseCurseForgeUrl(`  ${url} `));
    expect(link.type).toBe(type);
    expect(link.url).toBe(url);
    expect(link.fileId).toBe(fileId);
    expect(link.projectUrl).toMatch(
      /^https:\/\/www\.curseforge\.com\/minecraft\/[a-z-]+\/example-(pack|shader)$/,
    );
  });

  it.each([
    ["not a url", "full CurseForge link"],
    [`http://www.curseforge.com/minecraft/shaders/x`, "https"],
    [
      "https://www.curseforge.com.evil.example/minecraft/shaders/x",
      "not a curseforge.com",
    ],
    ["https://evilcurseforge.com/minecraft/shaders/x", "not a curseforge.com"],
    [
      "https://curseforge.com@evil.example/minecraft/shaders/x",
      "not a curseforge.com",
    ],
    [
      "https://www.curseforge.com:8443/minecraft/shaders/x",
      "not a curseforge.com",
    ],
    ["https://www.curseforge.com/wow/addons/x", "Minecraft project link"],
    [`${CF}/shaders`, "Minecraft project link"],
    [`${CF}/mc-mods/jei`, "Mod collection"],
    [`${CF}/unknown/x`, "not a CurseForge resource pack"],
  ])("rejects %s", (url, message) => {
    const result = parseCurseForgeUrl(url);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(message);
  });

  it("rejects a category that does not match the collection", () => {
    const result = parseCurseForgeUrl(`${CF}/shaders/x`, "resourcepack");
    expect(!result.ok && result.error).toContain("expects texture-packs");
  });

  it("suggests a name from the slug only", () => {
    expect(nameFromSlug("faithful-32x_pack")).toBe("Faithful 32x Pack");
  });
});

const cfInput = (url: string, change: Partial<ContentInput> = {}) => ({
  ...emptyContentInput(),
  name: "Example Pack",
  source: "curseforge" as const,
  sourceUrl: url,
  curseforgeUrl: url,
  ...change,
});
const add = (items: ContentItem[], input: ContentInput) => {
  const result = addContentItem(items, input, t0, "resourcepack");
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result;
};

describe("Scenario A: a CurseForge-only resource pack", () => {
  const url = `${CF}/texture-packs/example-pack/files/1234567`;
  const { item } = add(
    [],
    cfInput(url, { version: "1.4", minecraftVersions: ["26.1.2"] }),
  );

  it("creates a Planned, unverified entry from what the user entered", () => {
    expect(item).toMatchObject({
      id: "example-pack",
      source: "curseforge",
      sourceUrl: url,
      status: "planned",
      curseforge: { url, slug: "example-pack", fileId: "1234567" },
    });
    expect(item.modrinth).toBeUndefined();
    const compat = contentItemCompat(item, "resourcepack", "26.1.2");
    expect(compat.verification).toBe("unverified");
    expect(contentVerificationText(compat)).toBe("Unverified");
    expect(contentStatusLabel(compat)).toBe("Manual Match");
  });

  it("rejects a URL for another collection", () => {
    const result = addContentItem(
      [],
      cfInput(`${CF}/shaders/x`),
      t0,
      "resourcepack",
    );
    expect(!result.ok && result.errors.curseforgeUrl).toContain(
      "texture-packs",
    );
  });

  it("becomes Manually Verified after confirmation", () => {
    const confirmed = buildManualVerification(
      {
        source: "curseforge",
        version: "1.4",
        gameVersions: ["26.1.2"],
        loaders: [],
        evidenceUrl: url,
        confirmed: true,
      },
      t1,
      false,
    );
    if (confirmed.errors) throw new Error(JSON.stringify(confirmed.errors));
    const { loaders: _loaders, ...snapshot } = confirmed.value;
    void _loaders;
    const result = updateContentItem(
      [item],
      item.id,
      { ...inputFromItem(item), manualVerification: snapshot },
      t1,
      "resourcepack",
    );
    const verified = result.ok ? result.item : item;
    const compat = contentItemCompat(verified, "resourcepack", "26.1.2");
    expect(compat).toMatchObject({
      verification: "manual-verified",
      status: "compatible",
    });
    expect(contentVerificationText(compat)).toBe(
      "Manually Verified via CurseForge",
    );
  });

  it("still requires version, Minecraft versions, URL, and confirmation, but no modloader", () => {
    const result = buildManualVerification(
      {
        source: "curseforge",
        version: "",
        gameVersions: [],
        loaders: [],
        evidenceUrl: "nope",
        confirmed: false,
      },
      t1,
      false,
    );
    expect(Object.keys(result.errors ?? {}).sort()).toEqual([
      "confirmed",
      "evidenceUrl",
      "gameVersions",
      "version",
    ]);
  });
});

describe("Scenario B: a Modrinth shader with a newer CurseForge version", () => {
  const project: ModrinthProject = {
    id: "SHADER1",
    slug: "example-shader",
    title: "Example Shader",
    description: "",
    author: "",
    iconUrl: "",
    categories: [],
    clientSide: "required",
    serverSide: "unsupported",
    sourceUrl: "",
  };
  const imported = contentItemFromModrinth(
    project,
    mapVersion({
      id: "V1",
      project_id: "SHADER1",
      name: "r5.0",
      version_number: "r5.0",
      version_type: "release",
      game_versions: ["26.1.1"],
      loaders: ["iris", "optifine"],
      date_published: "2026-08-01T00:00:00Z",
      dependencies: [],
    }),
    "shader",
    [],
    t0,
  );
  const cfUrl = `${CF}/shaders/example-shader`;
  const snapshot = {
    source: "curseforge" as const,
    version: "r5.1",
    gameVersions: ["26.1.2"],
    evidenceUrl: `${cfUrl}/files/99`,
    verifiedAt: t1.toISOString(),
  };
  const update = (item: ContentItem, change: Partial<ContentInput>) => {
    const result = updateContentItem(
      [item],
      item.id,
      { ...inputFromItem(item), ...change },
      t1,
      "shader",
    );
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.item;
  };
  const verified = update(imported, {
    curseforgeUrl: cfUrl,
    version: "r5.1",
    minecraftVersions: ["26.1.2"],
    manualVerification: snapshot,
  });

  it("starts as verified via Modrinth with the runtime Unknown", () => {
    const compat = contentItemCompat(imported, "shader", "26.1.1");
    expect(compat.verification).toBe("modrinth");
    expect(contentVerificationText(compat)).toBe("Verified via Modrinth");
    expect(compat.checks.runtime).toBe("unknown");
    expect(compat.status).toBe("unknown");
  });

  it("attaches CurseForge and keeps the Modrinth identity and source", () => {
    expect(verified).toMatchObject({
      id: imported.id,
      source: "modrinth",
      sourceUrl: "https://modrinth.com/shader/example-shader",
      curseforge: { url: cfUrl, slug: "example-shader" },
      createdAt: t0.toISOString(),
    });
    expect(verified.modrinth).toEqual(imported.modrinth);
    expect(contentSourceText(verified, labels)).toBe("Modrinth + CurseForge");
  });

  it("uses the matching manual verification, with the runtime still Unknown", () => {
    const compat = contentItemCompat(verified, "shader", "26.1.2");
    expect(compat.verification).toBe("manual-verified");
    expect(compat.checks).toMatchObject({
      minecraft: "pass",
      runtime: "unknown",
    });
    expect(compat.status).toBe("unknown");
    expect(contentVerificationText(compat)).toBe(
      "Manually Verified via CurseForge",
    );
  });

  it("needs reverification when the version or Minecraft versions change", () => {
    for (const change of [
      { version: "r5.2" },
      { minecraftVersions: ["26.1.2", "26.2"] },
    ]) {
      const compat = contentItemCompat(
        update(verified, change),
        "shader",
        "26.1.2",
      );
      expect(compat.verification).toBe("stale");
      expect(contentVerificationText(compat)).toBe("Needs Reverification");
      expect(compat.evidence).toEqual(snapshot);
    }
  });

  it("is not affected by unrelated edits", () => {
    const edited = update(verified, {
      name: "Renamed",
      notes: "Looks great",
      tags: ["Fantasy"],
      status: "testing",
    });
    expect(contentItemCompat(edited, "shader", "26.1.2").verification).toBe(
      "manual-verified",
    );
  });

  it("lets Modrinth apply again when the values go back, and a stale snapshot never overrides it", () => {
    const back = update(verified, {
      version: "r5.0",
      minecraftVersions: ["26.1.1"],
    });
    expect(contentItemCompat(back, "shader", "26.1.1").verification).toBe(
      "modrinth",
    );
    expect(back.manualVerification).toEqual(snapshot);
  });

  it("can remove the CurseForge reference", () => {
    const removed = update(verified, { curseforgeUrl: "" });
    expect(removed.curseforge).toBeUndefined();
    expect(removed.modrinth).toEqual(imported.modrinth);
  });

  it("survives JSON export and import", () => {
    const file = contentFileSchema("shader").parse({
      version: 1,
      type: "shader",
      items: [verified],
    });
    const parsed = parseContentFile(serializeJson(file), "shaders");
    expect(parsed.items[0]).toEqual(verified);
    expect(
      contentItemCompat(parsed.items[0]!, "shader", "26.1.2").verification,
    ).toBe("manual-verified");
  });
});

describe("duplicates", () => {
  const url = `${CF}/texture-packs/example-pack`;
  const { items } = add([], cfInput(url));
  const link = (value: string) => ok(parseCurseForgeUrl(value));

  it("finds the same project from a file link", () => {
    expect(
      findCurseForgeDuplicate(items, link(`${url}/files/555`)),
    ).toMatchObject({ match: "url", item: { id: "example-pack" } });
  });

  it("finds an attached CurseForge reference on a Modrinth entry", () => {
    const modrinthItem = {
      ...items[0]!,
      id: "m",
      source: "modrinth" as const,
      sourceUrl: "https://modrinth.com/resourcepack/other",
      curseforge: { url, slug: "example-pack" },
    };
    expect(findCurseForgeDuplicate([modrinthItem], link(url))?.match).toBe(
      "url",
    );
  });

  it("only hints at a match by Modrinth slug or name", () => {
    const named = add([], {
      ...emptyContentInput(),
      name: "Example Pack",
    }).items;
    expect(findCurseForgeDuplicate(named, link(url))?.match).toBe("possible");
    expect(
      findCurseForgeDuplicate(named, link(`${CF}/texture-packs/other`)),
    ).toBeUndefined();
  });
});
