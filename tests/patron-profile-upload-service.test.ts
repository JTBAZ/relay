import { describe, expect, it } from "vitest";
import {
  isAllowedPatronProfileImageUrl,
  parsePatronProfileAssetContentPath,
  patronProfileAssetContentPath,
} from "../src/patron/patron-profile-upload-service.js";
import {
  buildPatronProfileR2ObjectKey,
  isPatronProfileAssetKind,
  isPatronProfileImageMimeAllowed,
} from "../src/storage/patron-profile-r2.js";

describe("patron profile R2 keys", () => {
  it("builds account-scoped object keys", () => {
    expect(buildPatronProfileR2ObjectKey("acc1", "avatar", "patron_pf_x")).toBe(
      "relay/patrons/acc1/profile/avatar/patron_pf_x/asset"
    );
  });

  it("validates asset kinds and image MIME types", () => {
    expect(isPatronProfileAssetKind("banner")).toBe(true);
    expect(isPatronProfileAssetKind("video")).toBe(false);
    expect(isPatronProfileImageMimeAllowed("image/png")).toBe(true);
    expect(isPatronProfileImageMimeAllowed("video/mp4")).toBe(false);
  });
});

describe("patron profile asset URLs", () => {
  it("round-trips content paths", () => {
    const path = patronProfileAssetContentPath("acc_1", "banner", "patron_pf_abc");
    expect(path).toBe(
      "/api/v1/public/patron-profile-assets/acc_1/banner/patron_pf_abc/content"
    );
    expect(parsePatronProfileAssetContentPath(path)).toEqual({
      accountId: "acc_1",
      kind: "banner",
      assetId: "patron_pf_abc",
    });
  });

  it("parses absolute URLs", () => {
    const parsed = parsePatronProfileAssetContentPath(
      "https://api.relay.test/api/v1/public/patron-profile-assets/acc1/avatar/id1/content"
    );
    expect(parsed?.accountId).toBe("acc1");
    expect(parsed?.kind).toBe("avatar");
  });

  it("allows static defaults and own hosted assets on patch", () => {
    const path = patronProfileAssetContentPath("acc1", "avatar", "patron_pf_1");
    expect(isAllowedPatronProfileImageUrl("/patron-profile/banners/patron-banner-default.png", "acc1")).toBe(
      true
    );
    expect(isAllowedPatronProfileImageUrl(path, "acc1")).toBe(true);
    expect(isAllowedPatronProfileImageUrl(path, "acc2")).toBe(false);
    expect(isAllowedPatronProfileImageUrl("https://evil.example/x.png", "acc1")).toBe(false);
  });
});
