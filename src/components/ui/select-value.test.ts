import { describe, expect, it } from "vitest";
import {
  EMPTY_VALUE,
  fromItemValue,
  labelFor,
  toItemValue,
} from "./select-value";

describe("select value mapping", () => {
  it("swaps the empty value for a sentinel and back", () => {
    expect(toItemValue("")).toBe(EMPTY_VALUE);
    expect(fromItemValue(EMPTY_VALUE)).toBe("");
  });

  it("leaves real values untouched both ways", () => {
    for (const value of ["neoforge", "26.1.2", "az", "Other"]) {
      expect(toItemValue(value)).toBe(value);
      expect(fromItemValue(toItemValue(value))).toBe(value);
    }
  });

  it("round-trips the empty value used by 'All' and 'Any' options", () => {
    expect(fromItemValue(toItemValue(""))).toBe("");
  });
});

describe("labelFor", () => {
  const options = [
    { value: "", label: "Any version" },
    { value: "26.1.2", label: "26.1.2 (pack)" },
  ];

  it("finds the label for a selected value, including the empty one", () => {
    expect(labelFor(options, "26.1.2")).toBe("26.1.2 (pack)");
    expect(labelFor(options, "")).toBe("Any version");
  });

  it("returns undefined for unknown or missing values", () => {
    expect(labelFor(options, "1.20.1")).toBeUndefined();
    expect(labelFor(options, undefined)).toBeUndefined();
  });
});
