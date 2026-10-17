import { describe, expect, it } from "vitest";
import {
  matchFabricRange,
  matchMavenRange,
  matchMinecraftRange,
  releaseParts,
} from "./versionRange";

describe("release versions", () => {
  it("parses numbered releases only", () => {
    expect(releaseParts("26.1.2")).toEqual([26, 1, 2]);
    expect(releaseParts("24w14a")).toBeNull();
    expect(releaseParts("1.21-pre1")).toBeNull();
  });
});

describe("Maven ranges (mods.toml)", () => {
  it("handles inclusive and exclusive bounds", () => {
    expect(matchMavenRange("[1.20.1,1.21)", "1.20.1")).toBe("match");
    expect(matchMavenRange("[1.20.1,1.21)", "1.21")).toBe("mismatch");
    expect(matchMavenRange("(1.20,1.21]", "1.20")).toBe("mismatch");
    expect(matchMavenRange("(1.20,1.21]", "1.21")).toBe("match");
  });

  it("handles open ends, exact versions, and lists", () => {
    expect(matchMavenRange("[26.1,)", "26.1.2")).toBe("match");
    expect(matchMavenRange("(,1.20.1]", "26.1.2")).toBe("mismatch");
    expect(matchMavenRange("[26.1.2]", "26.1.2")).toBe("match");
    expect(matchMavenRange("[1.19,1.20),[26.1,)", "26.1.2")).toBe("match");
    expect(matchMavenRange("[1.19,1.20),[1.21,1.22)", "26.1.2")).toBe(
      "mismatch",
    );
  });

  it("compares numerically, not as text", () => {
    expect(matchMavenRange("[1.21.9,1.21.11)", "1.21.10")).toBe("match");
  });

  it("only trusts a bare version when it is equal", () => {
    expect(matchMavenRange("26.1.2", "26.1.2")).toBe("match");
    expect(matchMavenRange("1.20.1", "26.1.2")).toBe("unknown");
  });

  it("is unknown for unparseable ranges or snapshot packs", () => {
    expect(matchMavenRange("[1.20,1.21", "1.20.1")).toBe("unknown");
    expect(matchMavenRange("[1.20-pre1,1.21)", "1.20.1")).toBe("unknown");
    expect(matchMavenRange("[1.20,1.21)", "24w14a")).toBe("unknown");
    expect(matchMavenRange("", "1.20.1")).toBe("unknown");
  });
});

describe("Fabric and Quilt predicates", () => {
  it("handles exact versions, wildcards, and any", () => {
    expect(matchFabricRange("1.20.1", "1.20.1")).toBe("match");
    expect(matchFabricRange("1.20.1", "1.20.2")).toBe("mismatch");
    expect(matchFabricRange("1.20.x", "1.20.4")).toBe("match");
    expect(matchFabricRange("1.20.x", "1.21")).toBe("mismatch");
    expect(matchFabricRange("*", "26.1.2")).toBe("match");
  });

  it("combines predicates with AND and alternatives with OR", () => {
    expect(matchFabricRange(">=1.20 <1.21", "1.20.4")).toBe("match");
    expect(matchFabricRange(">=1.20 <1.21", "1.21")).toBe("mismatch");
    expect(matchFabricRange("1.20.1 || 26.1.2", "26.1.2")).toBe("match");
  });

  it("handles tilde, caret, and the pre-release dash", () => {
    expect(matchFabricRange("~1.20.1", "1.20.4")).toBe("match");
    expect(matchFabricRange("~1.20.1", "1.21")).toBe("mismatch");
    expect(matchFabricRange("^1.20", "1.21.5")).toBe("match");
    expect(matchFabricRange(">=1.20-", "1.20.1")).toBe("match");
  });

  it("is unknown for versions it cannot compare", () => {
    expect(matchFabricRange(">=1.20-alpha.23.4", "1.20.1")).toBe("unknown");
    expect(matchFabricRange("1.20.1", "24w14a")).toBe("unknown");
  });
});

describe("choosing the evaluator", () => {
  it("uses the format the metadata came from", () => {
    expect(matchMinecraftRange("[26.1,)", "26.1.2", "neoforge.mods.toml")).toBe(
      "match",
    );
    expect(matchMinecraftRange("~26.1", "26.1.2", "fabric.mod.json")).toBe(
      "match",
    );
    expect(matchMinecraftRange("26.1.2", "26.1.2", "filename")).toBe("unknown");
  });
});
