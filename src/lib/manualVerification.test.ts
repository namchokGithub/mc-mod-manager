import { describe, expect, it } from "vitest";
import { withOrder } from "./batches";
import {
  activeSupport,
  checkCompatibility,
  manualVerificationMatches,
  statusLabel,
  verificationText,
} from "./compatibility";
import { mergeCandidateIntoMod, type ImportCandidate } from "./jar/importing";
import { serializeJson } from "./json";
import { buildManualVerification, isEvidenceUrl } from "./manualVerification";
import { describeChanges } from "./modChanges";
import { mergeModrinthIntoMod } from "./modrinth/mapping";
import { planningDashboard } from "./planningDashboard";
import {
  collectionSchema,
  parseJsonFile,
  type Collection,
  type ManualVerification,
  type Mod,
  type Modpack,
} from "./schema";

const pack: Modpack = {
  name: "Pack",
  description: "",
  version: "1",
  minecraftVersion: "26.1.2",
  modloader: "NeoForge",
  modloaderVersion: "",
  author: "",
  updatedAt: "2026-10-18",
  heroImageUrl: "",
};

const base: Mod = {
  id: "dungeons-arise",
  name: "When Dungeons Arise",
  version: "2.1.68",
  category: "Worldgen",
  tags: [],
  status: "planned",
  side: "both",
  source: "Modrinth",
  sourceUrl: "",
  description: "",
  dependencies: [],
  notes: "",
  imageUrl: "",
  modrinth: {
    projectId: "WDA",
    slug: "when-dungeons-arise",
    versionId: "v268",
    versionNumber: "2.1.68",
    gameVersions: ["26.1.1"],
    loaders: ["neoforge"],
    dependencies: [{ projectId: "LIB", versionId: null, type: "required" }],
  },
};

const curseforge: ManualVerification = {
  source: "curseforge",
  version: "2.1.71",
  gameVersions: ["26.1.2"],
  loaders: ["neoforge"],
  evidenceUrl:
    "https://www.curseforge.com/minecraft/mc-mods/when-dungeons-arise/files/1",
  verifiedAt: "2026-10-18T09:00:00.000Z",
};

// What the editor saves after "Verify manually" on 2.1.71.
const verified: Mod = {
  ...base,
  version: "2.1.71",
  source: "CurseForge",
  manualCompatibility: { gameVersions: ["26.1.2"], loaders: ["neoforge"] },
  manualVerification: curseforge,
};

const library: Mod = {
  ...base,
  id: "lib",
  name: "Lib",
  version: "1.0",
  modrinth: {
    projectId: "LIB",
    versionId: "lib1",
    versionNumber: "1.0",
    gameVersions: ["26.1.2"],
    loaders: ["neoforge"],
    dependencies: [],
  },
};

const check = (mods: Mod[], id = mods[0]!.id) =>
  checkCompatibility(mods, pack).get(id)!;

describe("verification precedence", () => {
  it("keeps Modrinth auto verification while the version matches", () => {
    const result = check([
      { ...base, modrinth: { ...base.modrinth!, gameVersions: ["26.1.2"] } },
      library,
    ]);
    expect(result.verification).toBe("modrinth");
    expect(result.status).toBe("compatible");
    expect(verificationText(result)).toBe("Verified with Modrinth");
  });

  it("uses a matching manual CurseForge verification for a newer version", () => {
    const result = check([verified, library]);
    expect(result.verification).toBe("manual-verified");
    expect(result.checks).toMatchObject({ minecraft: "pass", loader: "pass" });
    expect(result.status).toBe("compatible");
    expect(statusLabel(result)).toBe("Compatible");
    expect(verificationText(result)).toBe("Manually Verified via CurseForge");
    expect(result.evidence).toEqual(curseforge);
  });

  it("keeps the original Modrinth project identity and metadata", () => {
    expect(verified.modrinth).toEqual(base.modrinth);
    expect(verified.id).toBe(base.id);
  });

  it("does not count a record that does not match as verification", () => {
    const stale = { ...base, manualVerification: curseforge };
    // Version 2.1.68 still matches Modrinth: provider data wins over an old manual record.
    const result = check([stale, library]);
    expect(result.verification).toBe("modrinth");
    expect(
      result.reasons.some((reason) =>
        reason.message.includes("earlier manual verification"),
      ),
    ).toBe(true);
  });

  it("uses Modrinth again when the version goes back to the Modrinth one", () => {
    const back: Mod = {
      ...verified,
      version: "2.1.68",
      manualCompatibility: undefined,
    };
    expect(check([back, library]).verification).toBe("modrinth");
  });
});

describe("invalidation", () => {
  it.each([
    ["the version", { version: "2.1.72" }],
    [
      "the Minecraft versions",
      {
        manualCompatibility: {
          gameVersions: ["26.1.3"],
          loaders: ["neoforge"],
        },
      },
    ],
    [
      "the modloaders",
      {
        manualCompatibility: { gameVersions: ["26.1.2"], loaders: ["fabric"] },
      },
    ],
  ])("changing %s needs reverification", (_, change) => {
    const changed: Mod = { ...verified, ...change };
    expect(manualVerificationMatches(changed)).toBe(false);
    const result = check([changed, library]);
    expect(result.verification).toBe("stale");
    expect(verificationText(result)).toBe("Needs Reverification");
    expect(result.status).not.toBe("compatible");
    // The evidence is kept, not deleted.
    expect(result.evidence).toEqual(curseforge);
  });

  it("is not affected by name, category, tags, notes, or status", () => {
    const edited: Mod = {
      ...verified,
      name: "WDA",
      category: "Dungeons",
      tags: ["Structures"],
      notes: "Checked on CF",
      status: "testing",
    };
    expect(manualVerificationMatches(edited)).toBe(true);
    expect(check([edited, library]).verification).toBe("manual-verified");
  });

  it("flags a stale Modrinth version without any manual record", () => {
    const result = check([{ ...base, version: "2.1.71" }, library]);
    expect(result.verification).toBe("stale");
    expect(result.reasons[0]?.message).toContain("2.1.71");
  });
});

describe("dependencies stay separate", () => {
  it("keeps missing dependencies missing after manual verification", () => {
    const result = check([verified]);
    expect(result.verification).toBe("manual-verified");
    expect(result.checks).toMatchObject({
      minecraft: "pass",
      loader: "pass",
      dependencies: "fail",
    });
    expect(result.checkSources.dependencies).toBe("modrinth");
    expect(result.status).toBe("incompatible");
    expect(
      result.reasons.some((reason) =>
        reason.message.includes("Missing required dependency"),
      ),
    ).toBe(true);
  });

  it("leaves dependencies unknown when no provider data exists", () => {
    const manualOnly: Mod = {
      ...verified,
      id: "thai-font",
      modrinth: undefined,
    };
    const result = check([manualOnly]);
    expect(result.verification).toBe("manual-verified");
    expect(result.checks.dependencies).toBe("unknown");
    expect(result.status).toBe("compatible");
  });
});

describe("persistence and refresh", () => {
  it("survives JSON export and import", () => {
    const text = serializeJson([verified, library]);
    const parsed = parseJsonFile(text, "mods") as Mod[];
    expect(parsed[0]?.manualVerification).toEqual(curseforge);
    expect(check(parsed).verification).toBe("manual-verified");
  });

  it("rejects incomplete verification records", () => {
    const bad = (change: Partial<ManualVerification>) =>
      parseJsonFile(
        serializeJson([
          { ...verified, manualVerification: { ...curseforge, ...change } },
        ]),
        "mods",
      );
    expect(() => bad({ evidenceUrl: "not a url" })).toThrow();
    expect(() => bad({ gameVersions: [] })).toThrow();
    expect(() => bad({ loaders: [] })).toThrow();
  });

  it("keeps manual evidence through a Modrinth refresh and surfaces the conflict", () => {
    const incoming: Mod = {
      ...base,
      version: "2.1.69",
      modrinth: {
        ...base.modrinth!,
        versionId: "v269",
        versionNumber: "2.1.69",
      },
    };
    const merged = mergeModrinthIntoMod(verified, incoming);
    expect(merged.manualVerification).toEqual(curseforge);
    expect(merged.modrinth?.projectId).toBe("WDA");
    const change = describeChanges(verified, merged).find(
      (item) => item.field === "manualVerification",
    );
    expect(change).toMatchObject({ overwrites: true });
    // The version only changes when the user saves the reviewed form.
    expect(verified.version).toBe("2.1.71");
  });

  it("does not report a conflict when the refresh keeps the verified values", () => {
    const merged = { ...verified, notes: "x" };
    expect(describeChanges(verified, merged).map((item) => item.field)).toEqual(
      ["notes"],
    );
  });
});

describe("other sources", () => {
  it("leaves legacy manual entries unverified", () => {
    const legacy: Mod = {
      ...base,
      id: "thai-font",
      version: "",
      source: "Other",
      modrinth: undefined,
      manualCompatibility: { gameVersions: ["26.1.2"], loaders: ["neoforge"] },
    };
    const result = check([legacy]);
    expect(result.verification).toBe("manual");
    expect(statusLabel(result)).toBe("Manual Match");
    expect(verificationText(result)).toBe("Entered manually (not verified)");
  });

  it("keeps Local JAR verification working, including after a JAR update", () => {
    const candidate: ImportCandidate = {
      key: "k",
      metadata: {
        fileName: "lib.jar",
        format: "neoforge.mods.toml",
        readable: true,
        modId: "lib",
        version: "1.0",
        description: "",
        side: null,
        loaders: ["neoforge"],
        minecraftRange: "[26.1,)",
        dependencies: [],
        warnings: [],
      },
    };
    const jarMod = mergeCandidateIntoMod(
      { ...base, id: "jar", modrinth: undefined, version: "" },
      candidate,
    );
    const result = check([jarMod]);
    expect(result.verification).toBe("jar");
    expect(result.status).toBe("compatible");
    expect(verificationText(result)).toBe("Verified with Local JAR");
    expect(activeSupport(jarMod).loaders).toEqual(["neoforge"]);
  });
});

describe("planning and IDs", () => {
  const collection = (mods: Mod[]): Collection =>
    collectionSchema.parse({
      modpack: pack,
      mods,
      batches: withOrder([
        {
          id: "b",
          name: "B",
          description: "",
          order: 1,
          steps: [
            {
              id: "install",
              name: "Install",
              description: "",
              done: false,
              itemRefs: ["dungeons-arise"].map((id) => ({
                type: "mod" as const,
                id,
              })),
            },
          ],
        },
      ]),
    });

  it("keeps IDs and batches, and the dashboard does not count it as provider data", () => {
    const before = collection([base, library]);
    const after = collection([verified, library]);
    expect(after.mods.map((mod) => mod.id)).toEqual(
      before.mods.map((mod) => mod.id),
    );
    expect(after.batches).toEqual(before.batches);
    expect(planningDashboard(after)).toEqual(planningDashboard(before));
  });
});

describe("verification form", () => {
  const input = {
    source: "curseforge" as const,
    version: " 2.1.71 ",
    gameVersions: ["26.1.2"],
    loaders: ["NeoForge"],
    evidenceUrl: "https://www.curseforge.com/x",
    confirmed: true,
  };

  it("builds a dated snapshot from confirmed values", () => {
    expect(
      buildManualVerification(input, new Date("2026-10-18T09:00:00Z")),
    ).toEqual({
      value: {
        source: "curseforge",
        version: "2.1.71",
        gameVersions: ["26.1.2"],
        loaders: ["neoforge"],
        evidenceUrl: "https://www.curseforge.com/x",
        verifiedAt: "2026-10-18T09:00:00.000Z",
      },
    });
  });

  it("requires every field and explicit confirmation", () => {
    const result = buildManualVerification({
      ...input,
      version: "",
      gameVersions: [],
      loaders: [],
      evidenceUrl: "curseforge.com/x",
      confirmed: false,
    });
    expect(Object.keys(result.errors ?? {}).sort()).toEqual([
      "confirmed",
      "evidenceUrl",
      "gameVersions",
      "loaders",
      "version",
    ]);
  });

  it("accepts only http(s) URLs", () => {
    expect(isEvidenceUrl("https://github.com/a/b/releases")).toBe(true);
    expect(isEvidenceUrl("javascript:alert(1)")).toBe(false);
    expect(isEvidenceUrl("ftp://x.org")).toBe(false);
  });
});

describe("dependencies not needed for this pack", () => {
  // LambDynamicLights: one Modrinth version for Fabric, NeoForge, and Quilt lists Fabric API.
  const lamb: Mod = {
    ...base,
    id: "lambdynamiclights",
    name: "LambDynamicLights",
    version: "4.11.2+26.1.2",
    modrinth: {
      projectId: "yBW8D80W",
      versionId: "USlEyPPR",
      versionNumber: "4.11.2+26.1.2",
      gameVersions: ["26.1", "26.1.1", "26.1.2"],
      loaders: ["fabric", "neoforge", "quilt"],
      dependencies: [
        {
          projectId: "PxQSWIcD",
          versionId: null,
          type: "incompatible",
          name: "Sodium Dynamic Lights",
        },
        {
          projectId: "P7dR8mSH",
          versionId: null,
          type: "required",
          name: "Fabric API",
        },
      ],
    },
  };
  const ignoring: Mod = {
    ...lamb,
    ignoredDependencies: [
      { id: "P7dR8mSH", reason: "Only needed by the Fabric build." },
    ],
  };

  it("reports the listed requirement until it is marked not needed", () => {
    expect(check([lamb]).status).toBe("incompatible");
    const result = check([ignoring]);
    expect(result.status).toBe("compatible");
    expect(result.checks.dependencies).toBe("pass");
    expect(result.reasons).toEqual([
      {
        level: "info",
        message:
          "Fabric API is marked not needed for this pack: Only needed by the Fabric build.",
      },
    ]);
  });

  it("never hides declared conflicts", () => {
    const conflict: Mod = {
      ...lamb,
      id: "sodium-dl",
      modrinth: {
        projectId: "PxQSWIcD",
        versionId: "x",
        gameVersions: ["26.1.2"],
        loaders: ["neoforge"],
        dependencies: [],
      },
    };
    const result = check([
      {
        ...ignoring,
        ignoredDependencies: [
          ...ignoring.ignoredDependencies!,
          { id: "PxQSWIcD", reason: "x" },
        ],
      },
      conflict,
    ]);
    expect(result.status).toBe("incompatible");
  });

  it("works with manual verification and survives JSON", () => {
    const both: Mod = {
      ...ignoring,
      manualVerification: {
        ...curseforge,
        version: lamb.version,
        gameVersions: ["26.1", "26.1.1", "26.1.2"],
        loaders: ["fabric", "neoforge", "quilt"],
      },
    };
    const parsed = parseJsonFile(serializeJson([both]), "mods") as Mod[];
    expect(parsed[0]?.ignoredDependencies).toEqual(
      ignoring.ignoredDependencies,
    );
    expect(check(parsed)).toMatchObject({
      verification: "manual-verified",
      status: "compatible",
    });
    expect(() =>
      parseJsonFile(
        serializeJson([
          { ...lamb, ignoredDependencies: [{ id: "P7dR8mSH", reason: " " }] },
        ]),
        "mods",
      ),
    ).toThrow();
  });

  it("is left out of the dependency overview and dashboard", () => {
    const missing = (mod: Mod) =>
      planningDashboard(collectionSchema.parse({ modpack: pack, mods: [mod] }))
        .health.requiredMissing;
    expect(missing(lamb)).toBe(1);
    expect(missing(ignoring)).toBe(0);
  });
});
