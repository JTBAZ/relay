import { describe, expect, it } from "vitest";
import { looksLikePublicDirectObjectStorageUrl } from "../src/storage/media-delivery-policy.js";

describe("looksLikePublicDirectObjectStorageUrl", () => {
  it("returns false for non-http(s) strings", () => {
    expect(looksLikePublicDirectObjectStorageUrl("")).toBe(false);
    expect(looksLikePublicDirectObjectStorageUrl("ftp://x")).toBe(false);
    expect(looksLikePublicDirectObjectStorageUrl("/relative/path")).toBe(false);
  });

  it("flags public R2-style hosts", () => {
    expect(
      looksLikePublicDirectObjectStorageUrl("https://bucket.account.r2.dev/foo/bar.bin")
    ).toBe(true);
    expect(
      looksLikePublicDirectObjectStorageUrl(
        "https://account.r2.cloudflarestorage.com/bucket/key"
      )
    ).toBe(true);
  });

  it("flags common public S3 URL patterns", () => {
    expect(
      looksLikePublicDirectObjectStorageUrl("https://mybucket.s3.amazonaws.com/key")
    ).toBe(true);
    expect(
      looksLikePublicDirectObjectStorageUrl(
        "https://mybucket.s3.eu-west-1.amazonaws.com/object-key"
      )
    ).toBe(true);
  });

  it("does not treat Patreon CDN as object-storage public URL (heuristic)", () => {
    expect(
      looksLikePublicDirectObjectStorageUrl("https://c10.patreonusercontent.com/3/foo.jpg")
    ).toBe(false);
  });
});
