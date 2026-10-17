import { beforeEach, describe, expect, it, vi } from "vitest";
import { withOrder } from "../batches";
import { checkCompatibility } from "../compatibility";
import { inboxEntriesFromNames } from "../inbox";
import { planningDashboard } from "../planningDashboard";
import { quickAddMods } from "../quickAdd";
import { modsSchema, type Collection, type Mod, type Modpack } from "../schema";
import {
  createModrinthClient,
  type ProjectResponse,
  type VersionResponse,
} from "./api";
import {
  choiceFor,
  chooseDependencyVersion,
  directDependencies,
  planModrinthImport,
  resolveDirectDependencies,
  selectDependencies,
  transitiveNeeds,
  type DependencyResolution,
  type DirectDependency,
} from "./dependencyImport";
import { mapVersion, modFromModrinth, projectFromResponse } from "./mapping";
import { cachedProjectVersions, clearVersionCache } from "./service";

const pack = { gameVersion: "26.1.2", loader: "neoforge" };
const modpack: Modpack = {
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

function projectResponse(id: string, title = id): ProjectResponse {
  return {
    id,
    slug: id.toLowerCase(),
    title,
    description: "",
    icon_url: null,
    categories: ["library"],
    loaders: ["neoforge"],
    game_versions: ["26.1.2"],
    client_side: "required",
    server_side: "required",
  };
}

function versionResponse(
  id: string,
  projectId: string,
  overrides: Partial<VersionResponse> = {},
): VersionResponse {
  return {
    id,
    project_id: projectId,
    name: id,
    version_number: id,
    version_type: "release",
    game_versions: ["26.1.2"],
    loaders: ["neoforge"],
    date_published: "2026-09-01T00:00:00Z",
    dependencies: [],
    ...overrides,
  };
}

const version = (...args: Parameters<typeof versionResponse>) =>
  mapVersion(versionResponse(...args));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Serves projects, project version lists, and bulk versions from fixed data. */
function fakeModrinth(
  projects: ProjectResponse[],
  versions: Record<string, VersionResponse[] | number>,
) {
  const fetchMock = vi.fn(async (input: string) => {
    const url = new URL(input);
    const ids = JSON.parse(url.searchParams.get("ids") ?? "[]") as string[];
    if (url.pathname.endsWith("/projects"))
      return json(projects.filter((project) => ids.includes(project.id)));
    if (url.pathname.endsWith("/versions"))
      return json(
        Object.values(versions)
          .flatMap((list) => (Array.isArray(list) ? list : []))
          .filter((item) => ids.includes(item.id)),
      );
    const match = url.pathname.match(/\/project\/([^/]+)\/version$/);
    const list = match ? versions[decodeURIComponent(match[1] ?? "")] : 404;
    return typeof list === "number" ? json({}, list) : json(list ?? []);
  });
  return { client: createModrinthClient(fetchMock), fetchMock };
}

const dependency = (
  key: string,
  type: DirectDependency["type"] = "required",
  versionId: string | null = null,
): DirectDependency => ({
  key,
  projectId: key,
  versionId,
  name: key,
  type,
});

beforeEach(() => clearVersionCache());

describe("direct dependencies", () => {
  it("keeps required and optional entries once, required first", () => {
    const main = version("v1", "MAIN", {
      dependencies: [
        { project_id: "OPT", version_id: null, dependency_type: "optional" },
        { project_id: "LIB", version_id: null, dependency_type: "optional" },
        { project_id: "LIB", version_id: "lib-1", dependency_type: "required" },
        { project_id: "EMB", version_id: null, dependency_type: "embedded" },
        {
          project_id: "BAD",
          version_id: null,
          dependency_type: "incompatible",
        },
        { project_id: "MAIN", version_id: null, dependency_type: "required" },
        { project_id: null, version_id: "only-v", dependency_type: "required" },
      ],
    });
    expect(
      directDependencies(main).map((item) => [item.key, item.type]),
    ).toEqual([
      ["LIB", "required"],
      ["version:only-v", "required"],
      ["OPT", "optional"],
    ]);
    expect(directDependencies(main)[0]?.versionId).toBe("lib-1");
  });
});

describe("choosing a dependency version", () => {
  const list = [
    version("new-beta", "LIB", {
      version_type: "beta",
      date_published: "2026-10-01T00:00:00Z",
    }),
    version("release", "LIB", { date_published: "2026-09-01T00:00:00Z" }),
    version("fabric", "LIB", {
      loaders: ["fabric"],
      date_published: "2026-10-05T00:00:00Z",
    }),
    version("old-mc", "LIB", {
      game_versions: ["1.21.1"],
      date_published: "2026-10-06T00:00:00Z",
    }),
  ];

  it("filters by the pack's Minecraft version and loader and prefers releases", () => {
    expect(chooseDependencyVersion(list, dependency("LIB"), pack)).toEqual({
      version: expect.objectContaining({ id: "release" }),
    });
  });

  it("falls back to the newest beta with a note", () => {
    const result = chooseDependencyVersion(
      list.slice(0, 1),
      dependency("LIB"),
      pack,
    );
    expect(result).toMatchObject({
      version: { id: "new-beta" },
      note: expect.stringContaining("beta"),
    });
  });

  it("explains when nothing matches the pack", () => {
    expect(
      chooseDependencyVersion(list.slice(2), dependency("LIB"), pack),
    ).toEqual({
      reason: "No version is listed for Minecraft 26.1.2 with NeoForge.",
    });
    expect(
      chooseDependencyVersion(list, dependency("LIB"), {
        gameVersion: "26.1.2",
        loader: "",
      }),
    ).toHaveProperty("reason");
  });

  it("uses an exact version only when it fits the pack", () => {
    expect(
      chooseDependencyVersion(
        list,
        dependency("LIB", "required", "new-beta"),
        pack,
      ),
    ).toEqual({ version: expect.objectContaining({ id: "new-beta" }) });
    expect(
      chooseDependencyVersion(
        list,
        dependency("LIB", "required", "fabric"),
        pack,
      ),
    ).toEqual({
      reason:
        "The exact version it asks for (fabric) is not listed for NeoForge.",
    });
    expect(
      chooseDependencyVersion(
        list,
        dependency("LIB", "required", "gone"),
        pack,
      ),
    ).toHaveProperty("reason");
  });
});

describe("resolving dependencies", () => {
  it("resolves each dependency on its own, so one failure is reported but others are kept", async () => {
    const { client } = fakeModrinth(
      [projectResponse("LIB", "Lib"), projectResponse("DOWN", "Down")],
      { LIB: [versionResponse("lib-1", "LIB")], DOWN: 500 },
    );
    const results = await resolveDirectDependencies(
      client,
      [
        dependency("LIB"),
        dependency("DOWN"),
        dependency("MISSING"),
        { ...dependency("x"), key: "version:x", projectId: null },
      ],
      pack,
    );
    expect(results.get("LIB")).toMatchObject({
      status: "resolved",
      project: { id: "LIB", title: "Lib" },
      version: { id: "lib-1" },
    });
    expect(results.get("DOWN")).toEqual({
      status: "unresolved",
      reason: expect.stringContaining("(500)"),
    });
    expect(results.get("MISSING")).toEqual({
      status: "unresolved",
      reason: "Modrinth no longer lists this project.",
    });
    expect(results.get("version:x")?.status).toBe("unresolved");
  });

  it("reuses version lists the picker already loaded", async () => {
    const { client, fetchMock } = fakeModrinth([projectResponse("LIB")], {
      LIB: [versionResponse("lib-1", "LIB")],
    });
    await cachedProjectVersions(client, "LIB");
    await resolveDirectDependencies(client, [dependency("LIB")], pack);
    await resolveDirectDependencies(client, [dependency("LIB")], pack);
    const listCalls = fetchMock.mock.calls.filter(([url]) =>
      url.includes("/project/LIB/version"),
    );
    expect(listCalls).toHaveLength(1);
  });

  it("names the requirements of each chosen version for transitive warnings", async () => {
    const { client } = fakeModrinth(
      [projectResponse("LIB"), projectResponse("DEEP", "Deep Core")],
      {
        LIB: [
          versionResponse("lib-1", "LIB", {
            dependencies: [
              {
                project_id: "DEEP",
                version_id: null,
                dependency_type: "required",
              },
              {
                project_id: "MAIN",
                version_id: null,
                dependency_type: "required",
              },
            ],
          }),
        ],
      },
    );
    const resolved = (
      await resolveDirectDependencies(client, [dependency("LIB")], pack)
    ).get("LIB");
    expect(resolved?.status).toBe("resolved");
    if (resolved?.status !== "resolved") return;
    // The main mod is in this import, so the cycle back to it is not a warning.
    expect(transitiveNeeds(resolved.version, new Set(["MAIN", "LIB"]))).toEqual(
      ["Deep Core"],
    );
  });
});

describe("selection defaults", () => {
  const direct = [
    dependency("REQ"),
    dependency("OPT", "optional"),
    dependency("HAVE"),
  ];
  const resolved = (id: string): DependencyResolution => ({
    status: "resolved",
    project: projectFromResponse(projectResponse(id)),
    version: version(`${id}-1`, id),
  });
  const resolutions = new Map<string, DependencyResolution>([
    ["REQ", resolved("REQ")],
    ["OPT", resolved("OPT")],
    ["HAVE", resolved("HAVE")],
  ]);
  const have = modFromModrinth(
    projectFromResponse(projectResponse("HAVE")),
    version("have-0", "HAVE"),
    [],
  );

  it("selects missing required dependencies only and opens the section", () => {
    const result = selectDependencies(
      direct,
      resolutions,
      [have],
      choiceFor(null, "v1"),
    );
    expect(result.include).toBe(true);
    expect(result.expanded).toBe(true);
    expect(result.missing.map((item) => item.key)).toEqual(["REQ", "OPT"]);
    expect(result.selected.map((item) => item.dependency.key)).toEqual(["REQ"]);
  });

  it("is off when only optional dependencies are missing", () => {
    const result = selectDependencies(
      [dependency("OPT", "optional")],
      resolutions,
      [],
      choiceFor(null, "v1"),
    );
    expect(result.include).toBe(false);
    expect(result.selected).toEqual([]);
  });

  it("never selects unresolved dependencies", () => {
    const result = selectDependencies(
      [dependency("REQ")],
      new Map([["REQ", { status: "unresolved", reason: "x" }]]),
      [],
      { versionId: "v1", picks: { REQ: true } },
    );
    expect(result.selected).toEqual([]);
  });

  it("keeps choices for the same version and resets them for another", () => {
    const choice = { versionId: "v1", picks: { REQ: false, OPT: true } };
    expect(choiceFor(choice, "v1")).toBe(choice);
    const kept = selectDependencies(
      direct,
      resolutions,
      [],
      choiceFor(choice, "v1"),
    );
    expect(kept.selected.map((item) => item.dependency.key)).toEqual([
      "OPT",
      "HAVE",
    ]);
    const reset = selectDependencies(
      direct,
      resolutions,
      [],
      choiceFor(choice, "v2"),
    );
    expect(reset.selected.map((item) => item.dependency.key)).toEqual([
      "REQ",
      "HAVE",
    ]);
  });
});

describe("planning the import", () => {
  const libProject = projectFromResponse(projectResponse("LIB", "Lib"));
  const libVersion = version("lib-1", "LIB");
  const mainVersion = version("main-1", "MAIN", {
    dependencies: [
      { project_id: "LIB", version_id: null, dependency_type: "required" },
      { project_id: "GONE", version_id: null, dependency_type: "required" },
    ],
  });
  const existing: Mod[] = [
    ...quickAddMods(["Lib"], []),
    modFromModrinth(
      projectFromResponse(projectResponse("HAVE", "Have")),
      version("have-1", "HAVE"),
      [],
    ),
  ];
  const main = modFromModrinth(
    projectFromResponse(projectResponse("MAIN", "Main")),
    mainVersion,
    existing,
  );

  it("adds the main mod first, then dependencies as Planned with Modrinth metadata and unique IDs", () => {
    const plan = planModrinthImport(
      main,
      [{ project: libProject, version: libVersion }],
      existing,
    );
    expect(plan.created.map((mod) => mod.id)).toEqual(["main", "lib-2"]);
    expect(plan.created[1]).toMatchObject({
      name: "Lib",
      status: "planned",
      source: "Modrinth",
      modrinth: {
        projectId: "LIB",
        versionId: "lib-1",
        versionNumber: "lib-1",
      },
    });
    expect(modsSchema.safeParse([...existing, ...plan.created]).success).toBe(
      true,
    );
    expect(plan.stillMissing).toEqual([
      { modName: "Main", dependencyName: "GONE" },
    ]);
  });

  it("skips dependencies already in the collection or picked twice, and changes nothing", () => {
    const before = JSON.stringify(existing);
    const have = projectFromResponse(projectResponse("HAVE", "Have"));
    const plan = planModrinthImport(
      main,
      [
        { project: have, version: version("have-2", "HAVE") },
        { project: libProject, version: libVersion },
        { project: libProject, version: libVersion },
      ],
      existing,
    );
    expect(plan.created.map((mod) => mod.name)).toEqual(["Main", "Lib"]);
    expect(plan.skipped).toEqual([
      { name: "Have", reason: "Already in the collection as “Have”" },
      { name: "Lib", reason: "Already in this import" },
    ]);
    expect(JSON.stringify(existing)).toBe(before);
  });

  it("recalculates compatibility with the added dependencies present", () => {
    const alone = checkCompatibility([...existing, main], modpack).get("main");
    const plan = planModrinthImport(
      main,
      [{ project: libProject, version: libVersion }],
      existing,
    );
    const together = checkCompatibility(
      [...existing, ...plan.created],
      modpack,
    );
    const missingLib = (reasons: { message: string }[] | undefined) =>
      reasons?.some((reason) => reason.message.includes("LIB")) ?? false;
    expect(missingLib(alone?.reasons)).toBe(true);
    expect(missingLib(together.get("main")?.reasons)).toBe(false);
    expect(together.get("lib-2")?.status).toBe("compatible");
  });

  it("leaves batches and the inbox alone when applied", () => {
    const collection: Collection = {
      modpack,
      mods: existing,
      batches: withOrder([
        {
          id: "b",
          name: "B",
          description: "",
          order: 1,
          modIds: ["lib"],
          checklist: [],
        },
      ]),
      inbox: {
        version: 1,
        entries: inboxEntriesFromNames(
          ["Main"],
          [],
          new Date("2026-10-18T00:00:00Z"),
        ),
      },
    };
    const plan = planModrinthImport(
      main,
      [{ project: libProject, version: libVersion }],
      collection.mods,
    );
    const after: Collection = {
      ...collection,
      mods: modsSchema.parse([...collection.mods, ...plan.created]),
    };
    expect(after.batches).toEqual(collection.batches);
    expect(after.inbox).toEqual(collection.inbox);
    expect(planningDashboard(after).unassigned.map((mod) => mod.id)).toEqual(
      expect.arrayContaining(["main", "lib-2"]),
    );
  });
});
