import { describe, expect, it } from "vitest";
import {
  isPatronProfileHostedAsset,
  isPatronProfileStaticAsset,
  patronProfileAssetBrowserFetchPath,
  patronProfileAssetRequestPath,
} from "./patron-profile-asset-display";

describe("patronProfileAssetRequestPath", () => {
  it("accepts stored API paths", () => {
    const path =
      "/api/v1/public/patron-profile-assets/acc1/avatar/patron_pf_1/content";
    expect(patronProfileAssetRequestPath(path)).toBe(path);
  });

  it("extracts pathname from absolute API URLs", () => {
    expect(
      patronProfileAssetRequestPath(
        "http://127.0.0.1:8787/api/v1/public/patron-profile-assets/acc1/banner/id1/content"
      )
    ).toBe("/api/v1/public/patron-profile-assets/acc1/banner/id1/content");
  });

  it("returns null for unrelated URLs", () => {
    expect(patronProfileAssetRequestPath("https://evil.example/x.png")).toBeNull();
  });
});

describe("isPatronProfileHostedAsset", () => {
  it("maps relay asset paths to same-origin browser fetch paths", () => {
    const relayPath =
      "/api/v1/public/patron-profile-assets/acc1/avatar/patron_pf_1/content";
    expect(patronProfileAssetBrowserFetchPath(relayPath)).toBe(
      "/api/patron-profile-assets/acc1/avatar/patron_pf_1/content"
    );
  });

  it("detects static and relay-hosted assets", () => {
    expect(isPatronProfileStaticAsset("/patron-profile/banners/patron-banner-default.png")).toBe(
      true
    );
    expect(
      isPatronProfileHostedAsset(
        "/api/v1/public/patron-profile-assets/acc1/avatar/id1/content"
      )
    ).toBe(true);
    expect(isPatronProfileHostedAsset("https://evil.example/x.png")).toBe(false);
  });
});
