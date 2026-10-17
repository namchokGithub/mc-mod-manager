import { describe, expect, it } from "vitest";
import { resolveHeroImageUrl } from "./heroImage";

describe("hero image URL resolution", () => {
  it("uses the Vite base path for a public asset", () => {
    expect(
      resolveHeroImageUrl(
        "public/assets/theme/winter_slime_adventure_in_the_snow.png",
        "/mc-mod-manager/",
      ),
    ).toBe(
      "/mc-mod-manager/assets/theme/winter_slime_adventure_in_the_snow.png",
    );
  });

  it("encodes file names with spaces under the root base path", () => {
    expect(resolveHeroImageUrl("public/assets/my hero.png", "/")).toBe(
      "/assets/my%20hero.png",
    );
  });

  it("keeps an external image URL unchanged", () => {
    expect(
      resolveHeroImageUrl("https://example.com/hero.png", "/mc-mod-manager/"),
    ).toBe("https://example.com/hero.png");
  });
});
