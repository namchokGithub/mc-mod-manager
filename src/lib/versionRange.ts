// Evaluates the Minecraft version constraint a JAR declares against the pack's version.
// Anything that cannot be parsed confidently is "unknown", never a match.

export type RangeResult = "match" | "mismatch" | "unknown";

/** Numeric parts of a release version ("1.20.1" -> [1, 20, 1]); null for snapshots and pre-releases. */
export function releaseParts(version: string): number[] | null {
  const trimmed = version.trim();
  if (!/^\d+(\.\d+)*$/.test(trimmed)) return null;
  return trimmed.split(".").map(Number);
}

function compareParts(a: number[], b: number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

/**
 * Maven ranges used by mods.toml and neoforge.mods.toml: "[1.20.1,1.21)", "[1.20,)", "[26.1.2]",
 * and lists like "[1.19,1.20),[1.21,)". A bare version is only treated as a match when equal,
 * because Maven reads it as a soft recommendation.
 */
export function matchMavenRange(range: string, version: string): RangeResult {
  const target = releaseParts(version);
  const text = range.trim();
  if (!target || !text) return "unknown";
  if (text === "*") return "match";
  const groups = text.match(/[[(][^\])]*[\])]/g);
  if (!groups) {
    const bare = releaseParts(text);
    if (!bare) return "unknown";
    return compareParts(bare, target) === 0 ? "match" : "unknown";
  }
  if (groups.join(",").replace(/\s/g, "") !== text.replace(/\s/g, ""))
    return "unknown";
  let unknown = false;
  for (const group of groups) {
    const lowerInclusive = group.startsWith("[");
    const upperInclusive = group.endsWith("]");
    const inner = group
      .slice(1, -1)
      .split(",")
      .map((part) => part.trim());
    if (inner.length === 1) {
      const exact = releaseParts(inner[0] ?? "");
      if (!exact || !lowerInclusive || !upperInclusive) {
        unknown = true;
        continue;
      }
      if (compareParts(exact, target) === 0) return "match";
      continue;
    }
    if (inner.length !== 2) {
      unknown = true;
      continue;
    }
    const [lowText = "", highText = ""] = inner;
    const low = lowText ? releaseParts(lowText) : [];
    const high = highText ? releaseParts(highText) : [];
    if (!low || !high) {
      unknown = true;
      continue;
    }
    const aboveLow =
      !lowText ||
      (lowerInclusive
        ? compareParts(target, low) >= 0
        : compareParts(target, low) > 0);
    const belowHigh =
      !highText ||
      (upperInclusive
        ? compareParts(target, high) <= 0
        : compareParts(target, high) < 0);
    if (aboveLow && belowHigh) return "match";
  }
  return unknown ? "unknown" : "mismatch";
}

function matchPredicate(predicate: string, target: number[]): RangeResult {
  const parsed = predicate.match(/^(>=|<=|>|<|=|~|\^)?\s*(.+)$/);
  if (!parsed) return "unknown";
  const operator = parsed[1] ?? "";
  // A trailing "-" (Fabric's "include pre-releases") does not change release comparisons.
  const value = (parsed[2] ?? "").replace(/-$/, "");
  if (/^\d+(\.\d+)*\.[x*]$/i.test(value) && !operator) {
    const prefix = value.split(".").slice(0, -1).map(Number);
    return compareParts(prefix, target.slice(0, prefix.length)) === 0
      ? "match"
      : "mismatch";
  }
  const parts = releaseParts(value);
  if (!parts) return "unknown";
  const order = compareParts(target, parts);
  switch (operator) {
    case ">=":
      return order >= 0 ? "match" : "mismatch";
    case ">":
      return order > 0 ? "match" : "mismatch";
    case "<=":
      return order <= 0 ? "match" : "mismatch";
    case "<":
      return order < 0 ? "match" : "mismatch";
    case "~": {
      const ceiling = [parts[0] ?? 0, (parts[1] ?? 0) + 1];
      return order >= 0 && compareParts(target, ceiling) < 0
        ? "match"
        : "mismatch";
    }
    case "^": {
      const ceiling = [(parts[0] ?? 0) + 1];
      return order >= 0 && compareParts(target, ceiling) < 0
        ? "match"
        : "mismatch";
    }
    default:
      return order === 0 ? "match" : "mismatch";
  }
}

/**
 * Fabric and Quilt predicates: "*", "1.20.1", ">=1.20 <1.21", "~1.20.1", "^1.20", "1.20.x".
 * Alternatives joined with "||" (from arrays in the metadata) match if any one matches.
 */
export function matchFabricRange(range: string, version: string): RangeResult {
  const target = releaseParts(version);
  const text = range.trim();
  if (!target || !text) return "unknown";
  let unknown = false;
  for (const alternative of text.split("||")) {
    const predicates = alternative.trim().split(/\s+/).filter(Boolean);
    if (!predicates.length) continue;
    if (predicates.length === 1 && predicates[0] === "*") return "match";
    const results = predicates.map((predicate) =>
      matchPredicate(predicate, target),
    );
    if (results.includes("mismatch")) continue;
    if (results.every((result) => result === "match")) return "match";
    unknown = true;
  }
  return unknown ? "unknown" : "mismatch";
}

/** Picks the evaluator for the metadata format the range came from. */
export function matchMinecraftRange(
  range: string,
  version: string,
  format: string,
): RangeResult {
  if (format === "mods.toml" || format === "neoforge.mods.toml")
    return matchMavenRange(range, version);
  if (format === "fabric.mod.json" || format === "quilt.mod.json")
    return matchFabricRange(range, version);
  return "unknown";
}
