import { describe, expect, it } from "vitest";
import { removeMods } from "./mods";
import {
  pageSelectionState,
  paginate,
  pruneSelection,
  setPageSelected,
  toggleSelected,
} from "./pagination";
import type { Mod } from "./schema";

const ids = (count: number) =>
  Array.from({ length: count }, (_, index) => `m${index + 1}`);

function mod(id: string, name = id, category = "Utilities"): Mod {
  return {
    id,
    name,
    version: "",
    category,
    tags: [],
    status: "installed",
    side: "both",
    source: "Other",
    sourceUrl: "",
    description: "",
    dependencies: [],
    notes: "",
    imageUrl: "",
  };
}

describe("selection", () => {
  it("toggles single IDs", () => {
    const once = toggleSelected(new Set(), "a");
    expect([...once]).toEqual(["a"]);
    expect([...toggleSelected(once, "a")]).toEqual([]);
  });

  it("selects only the visible page and keeps other pages' selections", () => {
    const selected = new Set(["m1", "m60"]);
    const pageTwo = paginate(ids(120), 2, 50).items;
    const next = setPageSelected(selected, pageTwo, true);
    expect(next.size).toBe(51);
    expect(next.has("m1")).toBe(true);
    expect(next.has("m101")).toBe(false);
    const cleared = setPageSelected(next, pageTwo, false);
    expect([...cleared]).toEqual(["m1"]);
  });

  it("reports none, some, or all for the page checkbox", () => {
    const page = ["a", "b"];
    expect(pageSelectionState(new Set(), page)).toBe("none");
    expect(pageSelectionState(new Set(["a", "z"]), page)).toBe("some");
    expect(pageSelectionState(new Set(["a", "b"]), page)).toBe("all");
    expect(pageSelectionState(new Set(["a"]), [])).toBe("none");
  });

  it("drops IDs of mods that no longer exist", () => {
    expect([...pruneSelection(new Set(["a", "gone"]), ["a", "b"])]).toEqual([
      "a",
    ]);
  });
});

describe("bulk delete", () => {
  it("removes every selected mod in one pass and keeps the rest in order", () => {
    const mods = ["a", "b", "c", "d"].map((id) => mod(id));
    expect(
      removeMods(mods, new Set(["b", "d", "missing"])).map((item) => item.id),
    ).toEqual(["a", "c"]);
  });

  it("does not modify the original list", () => {
    const mods = ["a", "b"].map((id) => mod(id));
    removeMods(mods, ["a"]);
    expect(mods).toHaveLength(2);
  });
});
