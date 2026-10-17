import { describe, expect, it, vi } from "vitest";
import {
  addContentItem,
  emptyContentInput,
  parseContentFile,
} from "../content";
import { serializeJson } from "../json";
import {
  collectionSchema,
  contentFileSchema,
  type ContentItem,
} from "../schema";
import { createModrinthClient, searchUrl, type VersionResponse } from "./api";
import {
  contentCompatibility,
  contentItemFromModrinth,
  contentSearch,
  filterContentVersions,
  findContentDuplicate,
} from "./contentImport";
import { mapVersion, type ModrinthProject } from "./mapping";

const now = new Date("2026-10-18T10:00:00.000Z");

const version = (id: string, overrides: Partial<VersionResponse> = {}) =>
  mapVersion({
    id,
    project_id: "P",
    name: id,
    version_number: id,
    version_type: "release",
    game_versions: ["26.1.2"],
    loaders: ["minecraft"],
    date_published: "2026-09-01T00:00:00Z",
    dependencies: [],
    ...overrides,
  });

const project = (slug: string, title = slug): ModrinthProject => ({
  id: `id-${slug}`,
  slug,
  title,
  description: `${title} description`,
  author: "someone",
  iconUrl: `https://cdn.modrinth.com/${slug}.png`,
  categories: [],
  clientSide: "required",
  serverSide: "unsupported",
  sourceUrl: `https://modrinth.com/mod/${slug}`,
});

describe("search by content type", () => {
  const facets = (type: keyof typeof contentSearch, gameVersion?: string) =>
    JSON.parse(
      new URL(
        searchUrl({
          query: "x",
          projectType: contentSearch[type].projectType,
          gameVersion,
        }),
      ).searchParams.get("facets")!,
    ) as string[][];

  it("uses the Modrinth project type facet and no loader facet", () => {
    expect(facets("resourcepack", "26.1.2")).toEqual([
      ["project_type:resourcepack"],
      ["versions:26.1.2"],
    ]);
    expect(facets("datapack")).toEqual([["project_type:datapack"]]);
    expect(facets("shader")).toEqual([["project_type:shader"]]);
  });

  it("keeps mod search unchanged", () => {
    expect(
      JSON.parse(
        new URL(
          searchUrl({ query: "x", gameVersion: "26.1.2", loader: "neoforge" }),
        ).searchParams.get("facets")!,
      ),
    ).toEqual([
      ["project_type:mod"],
      ["versions:26.1.2"],
      ["categories:neoforge"],
    ]);
  });

  it("sends the facet to Modrinth", async () => {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({ hits: [], offset: 0, limit: 20, total_hits: 0 }),
        ),
    );
    await createModrinthClient(fetchMock).search({
      query: "bsl",
      projectType: "shader",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      encodeURIComponent('"project_type:shader"'),
    );
  });
});

describe("version filtering", () => {
  const list = [
    version("mod-build", {
      loaders: ["fabric", "neoforge"],
      date_published: "2026-10-01T00:00:00Z",
    }),
    version("pack-new", {
      loaders: ["datapack"],
      date_published: "2026-09-20T00:00:00Z",
    }),
    version("pack-old", {
      loaders: ["datapack"],
      game_versions: ["1.21.1"],
      date_published: "2026-01-01T00:00:00Z",
    }),
  ];

  it("keeps only data pack builds for data packs", () => {
    expect(
      filterContentVersions(list, "datapack", {
        gameVersion: "",
        showAll: false,
      }).map((item) => item.id),
    ).toEqual(["pack-new", "pack-old"]);
  });

  it("filters by Minecraft version only, and shows all on request", () => {
    expect(
      filterContentVersions(list, "datapack", {
        gameVersion: "26.1.2",
        showAll: false,
      }).map((item) => item.id),
    ).toEqual(["pack-new"]);
    expect(
      filterContentVersions(list, "datapack", {
        gameVersion: "26.1.2",
        showAll: true,
      }),
    ).toHaveLength(2);
    // Resource packs and shaders never filter by loader.
    expect(
      filterContentVersions(list, "resourcepack", {
        gameVersion: "26.1.2",
        showAll: false,
      }).map((item) => item.id),
    ).toEqual(["mod-build", "pack-new"]);
  });
});

describe("compatibility", () => {
  it("passes resource packs and data packs on Minecraft alone, without a modloader", () => {
    for (const type of ["resourcepack", "datapack"] as const) {
      const result = contentCompatibility(
        version("v", {
          loaders: type === "datapack" ? ["datapack"] : ["minecraft"],
        }),
        type,
        "26.1.2",
      );
      expect(result).toEqual({
        status: "compatible",
        checks: { minecraft: "pass", dependencies: "pass" },
        reasons: [],
      });
    }
  });

  it("fails on another Minecraft version and is unknown without one", () => {
    expect(
      contentCompatibility(version("v"), "resourcepack", "1.21.1").status,
    ).toBe("incompatible");
    expect(contentCompatibility(version("v"), "resourcepack", "").status).toBe(
      "unknown",
    );
    expect(
      contentCompatibility(
        version("v", { game_versions: [] }),
        "datapack",
        "26.1.2",
      ).checks.minecraft,
    ).toBe("unknown");
  });

  it("keeps the shader runtime unknown and never compares it to the modloader", () => {
    const result = contentCompatibility(
      version("v", { loaders: ["iris", "optifine"] }),
      "shader",
      "26.1.2",
    );
    expect(result.checks).toEqual({
      minecraft: "pass",
      runtime: "unknown",
      dependencies: "pass",
    });
    expect(result.status).toBe("unknown");
    expect(result.reasons[0]?.message).toContain("Iris, Optifine");
    expect(result.reasons[0]?.message).not.toMatch(/NeoForge|Fabric/);
  });

  it("does not call listed dependencies resolved", () => {
    const result = contentCompatibility(
      version("v", {
        dependencies: [
          { project_id: "X", version_id: null, dependency_type: "required" },
        ],
      }),
      "datapack",
      "26.1.2",
    );
    expect(result.checks.dependencies).toBe("unknown");
    expect(result.status).toBe("unknown");
  });
});

describe("mapping and duplicates", () => {
  const shader = project("bsl-shaders", "BSL Shaders");
  const picked = version("v8", {
    loaders: ["iris", "optifine"],
    version_type: "beta",
    game_versions: ["26.1.1", "26.1.2"],
    dependencies: [
      { project_id: "IRIS", version_id: null, dependency_type: "optional" },
    ],
  });

  it("maps project and version metadata into a Planned entry", () => {
    const item = contentItemFromModrinth(shader, picked, "shader", [], now);
    expect(item).toEqual({
      id: "bsl-shaders",
      name: "BSL Shaders",
      status: "planned",
      version: "v8",
      description: "BSL Shaders description",
      source: "modrinth",
      sourceUrl: "https://modrinth.com/shader/bsl-shaders",
      imageUrl: "https://cdn.modrinth.com/bsl-shaders.png",
      minecraftVersions: ["26.1.1", "26.1.2"],
      tags: [],
      notes: "",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      modrinth: {
        projectId: "id-bsl-shaders",
        slug: "bsl-shaders",
        versionId: "v8",
        versionNumber: "v8",
        versionType: "beta",
        datePublished: "2026-09-01T00:00:00Z",
        gameVersions: ["26.1.1", "26.1.2"],
        loaders: ["iris", "optifine"],
        dependencies: [
          { projectId: "IRIS", versionId: null, type: "optional" },
        ],
        syncedAt: now.toISOString(),
      },
    });
  });

  it("goes only into the destination collection and survives JSON", () => {
    const item = contentItemFromModrinth(shader, picked, "shader", [], now);
    const file = contentFileSchema("shader").parse({
      version: 1,
      type: "shader",
      items: [item],
    });
    expect(parseContentFile(serializeJson(file), "shaders")).toEqual(file);
    expect(() =>
      parseContentFile(serializeJson(file), "resourcePacks"),
    ).toThrow();
    const collection = collectionSchema.parse({
      modpack: {
        name: "P",
        description: "",
        version: "",
        minecraftVersion: "26.1.2",
        modloader: "NeoForge",
        modloaderVersion: "",
        author: "",
        updatedAt: "2026-10-18",
        heroImageUrl: "",
      },
      mods: [],
      shaders: file,
    });
    expect(collection.shaders.items[0]?.modrinth?.projectId).toBe(
      "id-bsl-shaders",
    );
    expect(collection.resourcePacks.items).toEqual([]);
    expect(collection.mods).toEqual([]);
  });

  it("gives a unique ID when the slug is taken", () => {
    const taken = [{ id: "bsl-shaders" }] as ContentItem[];
    expect(
      contentItemFromModrinth(shader, picked, "shader", taken, now).id,
    ).toBe("bsl-shaders-2");
  });

  it("finds duplicates by project ID, then Modrinth URL, then name as a hint", () => {
    const imported = contentItemFromModrinth(shader, picked, "shader", [], now);
    expect(findContentDuplicate([imported], shader)?.match).toBe("project");

    const manual = (change: Partial<ReturnType<typeof emptyContentInput>>) => {
      const result = addContentItem(
        [],
        { ...emptyContentInput(), name: "My shader", ...change },
        now,
      );
      if (!result.ok) throw new Error("invalid");
      return result.items;
    };
    expect(
      findContentDuplicate(
        manual({
          sourceUrl: "https://modrinth.com/shader/BSL-Shaders/versions",
        }),
        shader,
      )?.match,
    ).toBe("url");
    expect(
      findContentDuplicate(
        manual({ sourceUrl: "https://modrinth.com/shader/id-bsl-shaders" }),
        shader,
      )?.match,
    ).toBe("url");
    expect(
      findContentDuplicate(manual({ name: "bsl shaders " }), shader)?.match,
    ).toBe("name");
    expect(
      findContentDuplicate(
        manual({
          sourceUrl: "https://www.curseforge.com/minecraft/shaders/bsl",
        }),
        shader,
      ),
    ).toBeUndefined();
  });
});
