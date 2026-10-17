import { describe, expect, it } from "vitest";
import { resolveRoute } from "./routes";

describe("routing with Manage enabled (pnpm dev)", () => {
  it("opens Preview and Manage", () => {
    expect(resolveRoute("", true)).toEqual({ page: "preview" });
    expect(resolveRoute("#/", true)).toEqual({ page: "preview" });
    expect(resolveRoute("#/manage", true)).toEqual({ page: "manage" });
    expect(resolveRoute("#/manage/", true)).toEqual({ page: "manage" });
    expect(resolveRoute("#/manage?tab=data", true)).toEqual({ page: "manage" });
  });

  it("redirects unknown routes to Preview", () => {
    expect(resolveRoute("#/unknown", true)).toEqual({
      page: "preview",
      redirect: "#/",
    });
    expect(resolveRoute("#/managed", true)).toEqual({
      page: "preview",
      redirect: "#/",
    });
  });
});

describe("routing with Manage disabled (production)", () => {
  it("never opens Manage and redirects its route to Preview", () => {
    expect(resolveRoute("#/manage", false)).toEqual({
      page: "preview",
      redirect: "#/",
    });
    expect(resolveRoute("#/manage/", false)).toEqual({
      page: "preview",
      redirect: "#/",
    });
  });

  it("keeps Preview and its in-page anchors", () => {
    expect(resolveRoute("", false)).toEqual({ page: "preview" });
    expect(resolveRoute("#/", false)).toEqual({ page: "preview" });
    expect(resolveRoute("#collection", false)).toEqual({ page: "preview" });
  });

  it("redirects unknown routes to Preview", () => {
    expect(resolveRoute("#/anything", false)).toEqual({
      page: "preview",
      redirect: "#/",
    });
  });
});
