import { describe, expect, it } from "vitest";
import { filterMods, removeMods, type Filters } from "./mods";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
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

describe("pagination", () => {
  it("offers 10, 20, 50, and 100 per page, defaulting to 50", () => {
    expect(PAGE_SIZES).toEqual([10, 20, 50, 100]);
    expect(DEFAULT_PAGE_SIZE).toBe(50);
  });

  it("slices pages and reports the visible range", () => {
    const page = paginate(ids(120), 2, 50);
    expect(page).toMatchObject({
      page: 2,
      pageCount: 3,
      total: 120,
      from: 51,
      to: 100,
    });
    expect(page.items[0]).toBe("m51");
    expect(paginate(ids(120), 3, 50)).toMatchObject({ from: 101, to: 120 });
  });

  it("changes the page count with the page size", () => {
    expect(paginate(ids(120), 1, 20).pageCount).toBe(6);
    expect(paginate(ids(120), 1, 100).pageCount).toBe(2);
  });

  it("clamps a page that is out of range", () => {
    expect(paginate(ids(30), 5, 20)).toMatchObject({
      page: 2,
      from: 21,
      to: 30,
    });
    expect(paginate(ids(30), 0, 20).page).toBe(1);
    expect(paginate(ids(30), Number.NaN, 20).page).toBe(1);
  });

  it("handles an empty list", () => {
    expect(paginate([], 3, 50)).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
      from: 0,
      to: 0,
    });
  });

  it("pages the already filtered and sorted list", () => {
    const mods = [
      ...ids(25).map((id) => mod(id, `Alpha ${id}`)),
      ...ids(5).map((id) => mod(`x${id}`, `Zeta ${id}`, "Visuals")),
    ];
    const filters: Filters = {
      query: "",
      category: "Visuals",
      status: "",
      side: "",
      sort: "za",
    };
    const page = paginate(filterMods(mods, filters), 1, 20);
    expect(page.total).toBe(5);
    expect(page.pageCount).toBe(1);
    expect(page.items[0]?.name).toBe("Zeta m5");
  });

  it("stays valid after deleting the whole last page", () => {
    const mods = ids(45).map((id) => mod(id));
    const remaining = removeMods(mods, ids(45).slice(40));
    expect(paginate(remaining, 3, 20)).toMatchObject({
      page: 2,
      from: 21,
      to: 40,
    });
  });
});

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
