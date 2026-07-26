import { describe, expect, it } from "vitest";
import {
  PATRON_PROFILE_DEFAULT_BANNER_SRC,
  resolvePatronProfileBannerSrc,
} from "../../web/lib/patron-profile-banner-presets";

describe("patron-profile-banner-presets", () => {
  it("returns the default banner when no custom url is set", () => {
    expect(resolvePatronProfileBannerSrc({ bannerUrl: null }).src).toBe(
      PATRON_PROFILE_DEFAULT_BANNER_SRC
    );
  });

  it("prefers custom banner_url when set", () => {
    const out = resolvePatronProfileBannerSrc({
      bannerUrl: "https://cdn.example/cover.jpg",
    });
    expect(out.src).toBe("https://cdn.example/cover.jpg");
  });
});
