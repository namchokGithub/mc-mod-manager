import { describe, expect, it } from "vitest";
import { serializeJson } from "./json";
import { filterMods, type Filters } from "./mods";
import { priorityOf, priorityRank } from "./priority";
import { quickAddMods } from "./quickAdd";
import { modSchema, parseJsonFile, type Mod } from "./schema";

const [base] = quickAddMods(["Base"], []);
const mod = (name: string, priority?: Mod["priority"]): Mod => ({
  ...base!,
  id: name.toLowerCase(),
  name,
  ...(priority && { priority }),
});
const mods = [
  mod("Zed", "low"),
  mod("Alpha"),
  mod("Core", "critical"),
  mod("Extra", "optional"),
  mod("Beta", "high"),
  mod("Able", "normal"),
];
const filters: Filters = {
  query: "",
  category: "",
  status: "",
  side: "",
  priority: "",
  sort: "az",
};
const names = (change: Partial<Filters>) =>
  filterMods(mods, { ...filters, ...change }).map((item) => item.name);

describe("priority", () => {
  it("defaults to normal without writing it, and rejects unknown values", () => {
    expect(priorityOf(mod("Alpha"))).toBe("normal");
    expect("priority" in mod("Alpha")).toBe(false);
    expect(priorityRank(mod("Core", "critical"))).toBe(0);
    expect(modSchema.safeParse(mod("Alpha")).success).toBe(true);
    expect(
      modSchema.safeParse({ ...mod("Alpha"), priority: "urgent" }).success,
    ).toBe(false);
  });

  it("filters by priority, counting missing as normal", () => {
    expect(names({ priority: "normal" })).toEqual(["Able", "Alpha"]);
    expect(names({ priority: "critical" })).toEqual(["Core"]);
    expect(names({})).toHaveLength(6);
  });

  it("sorts highest or lowest first, ties by name", () => {
    expect(names({ sort: "priority-desc" })).toEqual([
      "Core",
      "Beta",
      "Able",
      "Alpha",
      "Zed",
      "Extra",
    ]);
    expect(names({ sort: "priority-asc" })).toEqual([
      "Extra",
      "Zed",
      "Able",
      "Alpha",
      "Beta",
      "Core",
    ]);
  });

  it("keeps working for filters without a priority field", () => {
    const { priority: _p, ...old } = filters;
    void _p;
    expect(filterMods(mods, old)).toHaveLength(6);
  });

  it("survives export and import; older files load as normal", () => {
    const parsed = parseJsonFile(serializeJson(mods), "mods") as Mod[];
    expect(parsed.map((item) => item.priority)).toEqual([
      "low",
      undefined,
      "critical",
      "optional",
      "high",
      "normal",
    ]);
    expect(priorityOf(parsed[1]!)).toBe("normal");
  });
});
