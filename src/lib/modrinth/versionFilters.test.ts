import { describe, expect, it } from "vitest";
import type { ModrinthVersion } from "./mapping";
import {
  compareMinecraftVersions,
  filterVersions,
  loaderLabel,
  matchesFilter,
  packMismatches,
  sortMinecraftVersions,
  versionFilterOptions,
} from "./versionFilters";

function version(
  id: string,
  gameVersions: string[],
  loaders: string[],
  datePublished = "2025-01-01T00:00:00Z",
): ModrinthVersion {
  return {
    id,
    projectId: "p",
    name: id,
    versionNumber: id,
    versionType: "release",
    gameVersions,
    loaders,
    datePublished,
    dependencies: [],
  };
}

const versions = [
  version("neo-26", ["26.1.2", "26.1.1"], ["neoforge"], "2026-05-01T00:00:00Z"),
  version("fabric-26", ["26.1.2"], ["fabric", "quilt"], "2026-04-01T00:00:00Z"),
  version("forge-1201", ["1.20.1"], ["forge"], "2024-01-01T00:00:00Z"),
  version(
    "neo-1201",
    ["1.20.1"],
    ["neoforge", "forge"],
    "2024-02-01T00:00:00Z",
  ),
];

describe("Minecraft version ordering", () => {
  it("sorts numerically, newest first", () => {
    expect(
      sortMinecraftVersions([
        "1.20.1",
        "1.21.10",
        "1.21.9",
        "26.1",
        "1.21",
        "26.1.2",
      ]),
    ).toEqual(["26.1.2", "26.1", "1.21.10", "1.21.9", "1.21", "1.20.1"]);
  });

  it("puts a release before its release candidates and pre-releases", () => {
    expect(
      sortMinecraftVersions(["26.2-pre1", "26.2", "26.2-rc-2", "26.2-rc-1"]),
    ).toEqual(["26.2", "26.2-rc-2", "26.2-rc-1", "26.2-pre1"]);
  });

  it("puts snapshots after numbered versions and removes duplicates", () => {
    expect(
      sortMinecraftVersions(["24w14a", "1.20.1", "1.20.1", "25w02a"]),
    ).toEqual(["1.20.1", "25w02a", "24w14a"]);
    expect(compareMinecraftVersions("1.20", "1.20.0")).toBe(0);
  });
});

describe("filter options", () => {
  it("collects versions and loaders from metadata, known loaders first", () => {
    expect(versionFilterOptions(versions, {})).toEqual({
      gameVersions: ["26.1.2", "26.1.1", "1.20.1"],
      loaders: ["fabric", "forge", "neoforge", "quilt"],
    });
  });

  it("always includes the pack's own version and loader", () => {
    const options = versionFilterOptions([versions[2]!], {
      gameVersion: "26.1.2",
      loader: "neoforge",
    });
    expect(options.gameVersions).toEqual(["26.1.2", "1.20.1"]);
    expect(options.loaders).toEqual(["forge", "neoforge"]);
  });

  it("keeps unknown loaders after the supported ones", () => {
    expect(
      versionFilterOptions(
        [version("x", ["1.20.1"], ["liteloader", "fabric"])],
        {},
      ).loaders,
    ).toEqual(["fabric", "liteloader"]);
    expect(loaderLabel("neoforge")).toBe("NeoForge");
    expect(loaderLabel("liteloader")).toBe("Liteloader");
  });
});

describe("version filtering", () => {
  it("requires both filters to match exactly", () => {
    const ids = filterVersions(versions, {
      gameVersion: "1.20.1",
      loader: "neoforge",
      showAll: false,
    }).map((item) => item.id);
    expect(ids).toEqual(["neo-1201"]);
  });

  it("does not treat a prefix as a match", () => {
    expect(
      matchesFilter(version("x", ["1.20.10"], ["fabric"]), {
        gameVersion: "1.20.1",
        loader: "fabric",
        showAll: false,
      }),
    ).toBe(false);
  });

  it("treats an empty filter as any value", () => {
    expect(
      filterVersions(versions, {
        gameVersion: "",
        loader: "forge",
        showAll: false,
      }).map((item) => item.id),
    ).toEqual(["neo-1201", "forge-1201"]);
  });

  it("shows every version, newest first, when filters are bypassed", () => {
    expect(
      filterVersions(versions, {
        gameVersion: "9.9",
        loader: "rift",
        showAll: true,
      }).map((item) => item.id),
    ).toEqual(["neo-26", "fabric-26", "neo-1201", "forge-1201"]);
  });

  it("returns nothing when no version matches", () => {
    expect(
      filterVersions(versions, {
        gameVersion: "26.1.2",
        loader: "forge",
        showAll: false,
      }),
    ).toEqual([]);
  });
});

describe("pack mismatches", () => {
  const pack = { gameVersion: "26.1.2", loader: "neoforge" };

  it("is empty when a version matches the pack", () => {
    expect(packMismatches(versions[0]!, pack)).toEqual([]);
  });

  it("names each setting the version is not listed for", () => {
    expect(packMismatches(versions[2]!, pack)).toEqual([
      "Minecraft 26.1.2",
      "NeoForge",
    ]);
    expect(packMismatches(versions[1]!, pack)).toEqual(["NeoForge"]);
  });

  it("ignores settings the pack does not have", () => {
    expect(packMismatches(versions[2]!, {})).toEqual([]);
  });
});
