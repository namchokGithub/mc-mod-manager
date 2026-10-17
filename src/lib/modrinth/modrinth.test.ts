import { describe, expect, it, vi } from "vitest";
import type { Mod } from "../schema";
import {
  createModrinthClient,
  ModrinthError,
  searchUrl,
  type SearchHit,
  type VersionResponse,
} from "./api";
import {
  mapVersion,
  mergeModrinthIntoMod,
  modFromModrinth,
  normalizeLoader,
  projectFromHit,
  sideFromProject,
} from "./mapping";
import { fetchLiveVersionFacts, resolveDependencies } from "./service";

const hit: SearchHit = {
  project_id: "YL57xq9U",
  slug: "iris",
  title: "Iris Shaders",
  description: "A shaders mod.",
  author: "coderbot",
  icon_url: "https://cdn.modrinth.com/data/YL57xq9U/icon.png",
  categories: ["fabric", "quilt", "decoration"],
  display_categories: ["fabric", "decoration", "game-mechanics"],
  versions: ["1.20.1"],
  downloads: 10,
  client_side: "required",
  server_side: "unsupported",
};

const versionResponse: VersionResponse = {
  id: "s5eFLITc",
  project_id: "YL57xq9U",
  name: "Iris 1.7.6",
  version_number: "1.7.6+1.20.1",
  version_type: "release",
  game_versions: ["1.20.1"],
  loaders: ["fabric", "quilt"],
  date_published: "2025-03-03T00:22:55Z",
  dependencies: [
    {
      project_id: "AANobbMI",
      version_id: "ryOMVRuG",
      dependency_type: "required",
    },
    { project_id: null, version_id: "abc", dependency_type: "optional" },
    { project_id: "X", version_id: null, dependency_type: "future-type" },
  ],
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("Modrinth search request", () => {
  it("filters by mod type, Minecraft version, and loader", () => {
    const url = new URL(
      searchUrl({
        query: " sodium ",
        gameVersion: "1.20.1",
        loader: "neoforge",
      }),
    );
    expect(url.searchParams.get("query")).toBe("sodium");
    expect(JSON.parse(url.searchParams.get("facets")!)).toEqual([
      ["project_type:mod"],
      ["versions:1.20.1"],
      ["categories:neoforge"],
    ]);
  });

  it("omits filters that are not set", () => {
    const url = new URL(searchUrl({ query: "jei" }));
    expect(JSON.parse(url.searchParams.get("facets")!)).toEqual([
      ["project_type:mod"],
    ]);
  });
});

describe("Modrinth client errors", () => {
  it("reports rate limits with the retry delay", async () => {
    const client = createModrinthClient(async () =>
      jsonResponse({}, { status: 429, headers: { "x-ratelimit-reset": "12" } }),
    );
    const error = await client.search({ query: "a" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModrinthError);
    expect(error).toMatchObject({ kind: "rate-limit", retryAfter: 12 });
  });

  it("reports network failures", async () => {
    const client = createModrinthClient(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(client.search({ query: "a" })).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("passes aborts through instead of reporting an error", async () => {
    const client = createModrinthClient(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    await expect(client.search({ query: "a" })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("reports server errors, missing projects, and malformed data", async () => {
    await expect(
      createModrinthClient(async () =>
        jsonResponse({}, { status: 503 }),
      ).search({
        query: "a",
      }),
    ).rejects.toMatchObject({ kind: "server" });
    await expect(
      createModrinthClient(async () =>
        jsonResponse({}, { status: 404 }),
      ).project("x"),
    ).rejects.toMatchObject({ kind: "not-found" });
    await expect(
      createModrinthClient(async () => jsonResponse({ hits: "nope" })).search({
        query: "a",
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("rejects versions with malformed dependencies instead of dropping them", async () => {
    const client = createModrinthClient(async () =>
      jsonResponse([{ ...versionResponse, dependencies: "bad" }]),
    );
    await expect(client.projectVersions("iris")).rejects.toMatchObject({
      kind: "invalid-response",
    });
  });

  it("sends version filters and parses the response", async () => {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>(async () =>
      jsonResponse([versionResponse]),
    );
    const versions = await createModrinthClient(fetchMock).projectVersions(
      "iris",
      {
        gameVersion: "1.20.1",
        loader: "fabric",
      },
    );
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/v2/project/iris/version");
    expect(url.searchParams.get("loaders")).toBe('["fabric"]');
    expect(url.searchParams.get("game_versions")).toBe('["1.20.1"]');
    expect(versions[0].id).toBe("s5eFLITc");
  });

  it("splits bulk requests into chunks", async () => {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>(async () =>
      jsonResponse([]),
    );
    const ids = Array.from({ length: 120 }, (_, index) => `id${index}`);
    await createModrinthClient(fetchMock).versions(ids);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("Modrinth mapping", () => {
  it("normalizes pack modloader names", () => {
    expect(normalizeLoader("NeoForge")).toBe("neoforge");
    expect(normalizeLoader(" neo-forge ")).toBe("neoforge");
    expect(normalizeLoader("Forge")).toBe("forge");
    expect(normalizeLoader("Fabric")).toBe("fabric");
    expect(normalizeLoader("Quilt")).toBe("quilt");
    expect(normalizeLoader("")).toBeNull();
    expect(normalizeLoader("Rift")).toBeNull();
  });

  it("maps installation side", () => {
    expect(
      sideFromProject({ clientSide: "required", serverSide: "unsupported" }),
    ).toBe("client");
    expect(
      sideFromProject({ clientSide: "unsupported", serverSide: "required" }),
    ).toBe("server");
    expect(
      sideFromProject({ clientSide: "optional", serverSide: "required" }),
    ).toBe("both");
    expect(
      sideFromProject({ clientSide: "unknown", serverSide: "unknown" }),
    ).toBe("both");
  });

  it("maps versions and drops unknown dependency types", () => {
    const version = mapVersion(versionResponse);
    expect(version.versionNumber).toBe("1.7.6+1.20.1");
    expect(version.dependencies).toEqual([
      { projectId: "AANobbMI", versionId: "ryOMVRuG", type: "required" },
      { projectId: null, versionId: "abc", type: "optional" },
    ]);
  });

  it("builds a valid mod with Modrinth metadata", () => {
    const project = projectFromHit(hit);
    const version = {
      ...mapVersion(versionResponse),
      dependencies: [
        {
          projectId: "AANobbMI",
          versionId: null,
          type: "required" as const,
          name: "Sodium",
        },
      ],
    };
    const mod = modFromModrinth(project, version, [], "2026-10-17T00:00:00Z");
    expect(mod).toMatchObject({
      id: "iris",
      name: "Iris Shaders",
      version: "1.7.6+1.20.1",
      category: "Decoration",
      tags: ["Game Mechanics"],
      side: "client",
      source: "Modrinth",
      sourceUrl: "https://modrinth.com/mod/iris",
      imageUrl: hit.icon_url,
      dependencies: ["Sodium"],
      notes: "",
      modrinth: {
        projectId: "YL57xq9U",
        versionId: "s5eFLITc",
        gameVersions: ["1.20.1"],
        loaders: ["fabric", "quilt"],
        syncedAt: "2026-10-17T00:00:00Z",
      },
    });
  });

  it("refreshes the version link without overwriting user fields", () => {
    const existing: Mod = {
      id: "iris",
      name: "My Iris",
      version: "old",
      category: "Visuals",
      tags: ["Mine"],
      status: "installed",
      side: "both",
      source: "Other",
      sourceUrl: "",
      description: "",
      dependencies: ["sodium"],
      notes: "Keep me",
      imageUrl: "",
    };
    const incoming = modFromModrinth(
      projectFromHit(hit),
      mapVersion(versionResponse),
      [],
    );
    const merged = mergeModrinthIntoMod(existing, incoming);
    expect(merged).toMatchObject({
      id: "iris",
      name: "My Iris",
      category: "Visuals",
      tags: ["Mine"],
      status: "installed",
      side: "both",
      source: "Other",
      notes: "Keep me",
      dependencies: ["sodium"],
      version: "1.7.6+1.20.1",
      sourceUrl: "https://modrinth.com/mod/iris",
      description: "A shaders mod.",
      imageUrl: hit.icon_url,
    });
    expect(merged.modrinth?.versionId).toBe("s5eFLITc");
  });
});

describe("Modrinth dependency resolution", () => {
  it("resolves version-only dependencies and adds names", async () => {
    const fetchMock = vi.fn(async (input: string) =>
      input.includes("/versions?")
        ? jsonResponse([{ ...versionResponse, id: "abc", project_id: "P2" }])
        : jsonResponse([
            {
              id: "AANobbMI",
              slug: "sodium",
              title: "Sodium",
              description: "",
              icon_url: null,
              categories: [],
              loaders: [],
              game_versions: [],
              client_side: "required",
              server_side: "unsupported",
            },
          ]),
    );
    const version = await resolveDependencies(
      createModrinthClient(fetchMock),
      mapVersion(versionResponse),
    );
    expect(version.dependencies).toEqual([
      {
        projectId: "AANobbMI",
        versionId: "ryOMVRuG",
        type: "required",
        name: "Sodium",
      },
      { projectId: "P2", versionId: "abc", type: "optional" },
    ]);
  });

  it("marks linked versions that Modrinth no longer returns", async () => {
    const client = createModrinthClient(async () =>
      jsonResponse([versionResponse]),
    );
    const base = {
      name: "x",
      version: "",
      category: "x",
      tags: [],
      status: "installed" as const,
      side: "both" as const,
      source: "Modrinth" as const,
      sourceUrl: "",
      description: "",
      dependencies: [],
      notes: "",
      imageUrl: "",
    };
    const facts = await fetchLiveVersionFacts(client, [
      {
        ...base,
        id: "a",
        modrinth: { projectId: "YL57xq9U", versionId: "s5eFLITc" },
      },
      { ...base, id: "b", modrinth: { projectId: "Q", versionId: "gone" } },
      { ...base, id: "c" },
    ]);
    expect(facts.get("s5eFLITc")?.loaders).toEqual(["fabric", "quilt"]);
    expect(facts.get("gone")).toBeNull();
    expect(facts.size).toBe(2);
  });
});
