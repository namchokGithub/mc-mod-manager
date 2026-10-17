import { beforeEach, describe, expect, it, vi } from "vitest";
import modpackJson from "../../public/data/modpack.json";
import modsJson from "../../public/data/mods.json";
import { createModrinthClient, type VersionResponse } from "./modrinth/api";
import type { ModrinthVersion } from "./modrinth/mapping";
import {
  cachedProjectVersions,
  checkUpdates,
  clearVersionCache,
  matchFilesByHash,
} from "./modrinth/service";
import { collectionSchema, parseJsonFile, type Mod } from "./schema";
import { computeUpdateStatus, pickLatest } from "./updates";

function version(
  id: string,
  datePublished: string,
  versionType = "release",
): ModrinthVersion {
  return {
    id,
    projectId: "p",
    name: id,
    versionNumber: `n-${id}`,
    versionType,
    gameVersions: ["1.20.1"],
    loaders: ["neoforge"],
    datePublished,
    dependencies: [],
  };
}

function linked(
  versionId?: string,
  extra: Partial<NonNullable<Mod["modrinth"]>> = {},
): Mod {
  return {
    id: "m",
    name: "M",
    version: "",
    category: "c",
    tags: [],
    status: "installed",
    side: "both",
    source: "Modrinth",
    sourceUrl: "",
    description: "",
    dependencies: [],
    notes: "",
    imageUrl: "",
    modrinth: { projectId: "p", versionId, ...extra },
  };
}

const older = version("old", "2024-01-01T00:00:00Z");
const newer = version("new", "2024-06-01T00:00:00Z");

describe("update status", () => {
  it("is up to date when the selected version is the newest", () => {
    expect(computeUpdateStatus(linked("new"), [newer, older]).status).toBe(
      "up-to-date",
    );
  });

  it("finds a newer version by publish date, not by version string", () => {
    // Version strings would sort the other way.
    const result = computeUpdateStatus(linked("old"), [
      { ...older, versionNumber: "9.0" },
      { ...newer, versionNumber: "1.0" },
    ]);
    expect(result).toMatchObject({
      status: "update-available",
      latest: { id: "new", versionNumber: "1.0" },
      current: { id: "old" },
      checkedVersionId: "old",
    });
  });

  it("ignores pre-releases when a release is selected", () => {
    const beta = version("beta", "2025-01-01T00:00:00Z", "beta");
    expect(
      computeUpdateStatus(linked("new"), [beta, newer, older]).status,
    ).toBe("up-to-date");
  });

  it("offers releases and betas when a beta is selected", () => {
    const beta = version("beta", "2024-03-01T00:00:00Z", "beta");
    expect(pickLatest([beta, newer], "beta").latest?.id).toBe("new");
  });

  it("is unknown when only pre-releases exist for a release", () => {
    const alpha = version("a", "2025-01-01T00:00:00Z", "alpha");
    expect(
      computeUpdateStatus(linked("x", { versionType: "release" }), [alpha])
        .reason,
    ).toContain("pre-release");
  });

  it("is unknown when the newest version is ambiguous", () => {
    const tie = version("tie", newer.datePublished);
    expect(computeUpdateStatus(linked("old"), [older, newer, tie]).status).toBe(
      "unknown",
    );
    const undated = version("u", "");
    expect(pickLatest([undated]).ambiguous).toBe(true);
  });

  it("uses the stored date when the current version is not listed", () => {
    const result = computeUpdateStatus(
      linked("gone", { datePublished: "2023-01-01T00:00:00Z" }),
      [newer],
    );
    expect(result.status).toBe("update-available");
    expect(result.reason).toContain("not listed");
  });

  it("is unknown when the current date cannot be compared", () => {
    expect(computeUpdateStatus(linked("gone"), [newer]).status).toBe("unknown");
    expect(
      computeUpdateStatus(
        linked("gone", { datePublished: "2030-01-01T00:00:00Z" }),
        [newer],
      ).status,
    ).toBe("unknown");
  });

  it("is unknown without a link, a version, or available versions", () => {
    const { modrinth: _unused, ...manual } = linked("x");
    void _unused;
    expect(computeUpdateStatus(manual, [newer]).reason).toBe(
      "Not linked to Modrinth.",
    );
    expect(computeUpdateStatus(linked(undefined), [newer]).status).toBe(
      "unknown",
    );
    expect(computeUpdateStatus(linked("x"), []).reason).toContain(
      "no versions",
    );
  });
});

const response = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

const apiVersion = (
  id: string,
  projectId: string,
  date: string,
): VersionResponse => ({
  id,
  project_id: projectId,
  name: id,
  version_number: id,
  version_type: "release",
  game_versions: ["1.20.1"],
  loaders: ["neoforge"],
  date_published: date,
  dependencies: [],
});

describe("update checking service", () => {
  beforeEach(() => clearVersionCache());
  const filters = { gameVersion: "1.20.1", loader: "neoforge" };

  it("fetches each project once and reports per mod", async () => {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>(async () =>
      response([apiVersion("new", "p", "2024-06-01T00:00:00Z")]),
    );
    const client = createModrinthClient(fetchMock);
    const { results, error } = await checkUpdates(
      client,
      [
        {
          ...linked("old", { datePublished: "2024-01-01T00:00:00Z" }),
          id: "a",
        },
        { ...linked("new"), id: "b" },
      ],
      filters,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toBeUndefined();
    expect(results.get("a")?.status).toBe("update-available");
    expect(results.get("b")?.status).toBe("up-to-date");
  });

  it("reuses cached version lists across checks", async () => {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>(async () =>
      response([]),
    );
    const client = createModrinthClient(fetchMock);
    await cachedProjectVersions(client, "p", filters);
    await cachedProjectVersions(client, "p", filters);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    let calls = 0;
    const client = createModrinthClient(async () => {
      calls += 1;
      return calls === 1 ? response({}, { status: 500 }) : response([]);
    });
    await expect(
      cachedProjectVersions(client, "p", filters),
    ).rejects.toMatchObject({
      kind: "server",
    });
    await expect(cachedProjectVersions(client, "p", filters)).resolves.toEqual(
      [],
    );
  });

  it("stops on a rate limit and leaves the rest unknown", async () => {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>(async () =>
      response({}, { status: 429, headers: { "x-ratelimit-reset": "30" } }),
    );
    const mods = ["p1", "p2", "p3"].map((projectId) => ({
      ...linked("v", { projectId }),
      id: projectId,
    }));
    const { results, error } = await checkUpdates(
      createModrinthClient(fetchMock),
      mods,
      filters,
      1,
    );
    expect(error).toMatchObject({ kind: "rate-limit", retryAfter: 30 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      [...results.values()].every((result) => result.status === "unknown"),
    ).toBe(true);
    expect(results.get("p2")?.reason).toContain("stopped accepting");
  });

  it("looks up selected versions missing from the filtered list once", async () => {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>(
      async (input) =>
        input.includes("/versions?")
          ? response([apiVersion("gone", "p", "2023-01-01T00:00:00Z")])
          : response([apiVersion("new", "p", "2024-06-01T00:00:00Z")]),
    );
    const { results } = await checkUpdates(
      createModrinthClient(fetchMock),
      [linked("gone")],
      filters,
    );
    expect(results.get("m")?.status).toBe("update-available");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is unknown for every mod when the pack loader is not set", async () => {
    const fetchMock = vi.fn<(input: string) => Promise<Response>>();
    const { results } = await checkUpdates(
      createModrinthClient(fetchMock),
      [linked("x")],
      { gameVersion: "1.20.1" },
    );
    expect(results.get("m")?.status).toBe("unknown");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("hash matching", () => {
  it("posts only hashes and maps matched projects", async () => {
    const hash = "c".repeat(40);
    const fetchMock = vi.fn<
      (input: string, init?: RequestInit) => Promise<Response>
    >(async (input) =>
      input.endsWith("/version_files")
        ? response({ [hash]: apiVersion("v1", "P", "2024-01-01T00:00:00Z") })
        : response([
            {
              id: "P",
              slug: "proj",
              title: "Project",
              description: "",
              icon_url: null,
              categories: ["utility"],
              loaders: [],
              game_versions: [],
              client_side: "required",
              server_side: "required",
            },
          ]),
    );
    const matches = await matchFilesByHash(createModrinthClient(fetchMock), [
      hash,
      "d".repeat(40),
    ]);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      hashes: [hash, "d".repeat(40)],
      algorithm: "sha1",
    });
    expect(matches.size).toBe(1);
    expect(matches.get(hash)).toMatchObject({
      project: { id: "P", slug: "proj", title: "Project" },
      version: { id: "v1", versionType: "release" },
    });
  });
});

describe("schema backward compatibility", () => {
  it("still accepts the published files", () => {
    expect(
      collectionSchema.safeParse({ modpack: modpackJson, mods: modsJson })
        .success,
    ).toBe(true);
  });

  it("round-trips the new optional fields through import", () => {
    const mod: Mod = {
      ...linked("v", {
        versionType: "beta",
        datePublished: "2024-01-01T00:00:00Z",
      }),
      file: { name: "a.jar", sha1: "e".repeat(40), modId: "a" },
    };
    expect(parseJsonFile(JSON.stringify([mod]), "mods")).toEqual([mod]);
  });

  it("rejects a malformed file hash", () => {
    expect(() =>
      parseJsonFile(
        JSON.stringify([
          { ...linked("v"), file: { name: "a.jar", sha1: "xyz" } },
        ]),
        "mods",
      ),
    ).toThrow();
  });
});
