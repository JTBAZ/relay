import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRelayR2ObjectKey,
  getAllowedMimePrefixesFromEnv,
  getPresignExpiresSec,
  getRelayUploadMaxBytes,
  isMimeTypeAllowed,
  isPresignedUrlExpired,
  presignedUrlSigningExpiresAt
} from "../src/storage/relay-upload-r2.js";

describe("relay-upload-r2", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("buildRelayR2ObjectKey matches ADR 002", () => {
    expect(buildRelayR2ObjectKey("cr_1", "relay_m_abc")).toBe("relay/tenants/cr_1/media/relay_m_abc/asset");
  });

  it("isMimeTypeAllowed default prefixes", () => {
    expect(isMimeTypeAllowed("video/mp4", ["video/"])).toBe(true);
    expect(isMimeTypeAllowed("application/x-msdownload", ["video/", "image/"])).toBe(false);
  });

  it("RELAY_UPLOAD_MAX_BYTES over env", () => {
    vi.stubEnv("RELAY_UPLOAD_MAX_BYTES", "1000");
    expect(getRelayUploadMaxBytes()).toBe(1000);
  });

  it("R2_PRESIGN_EXPIRES_SEC over env (clamped to sane window)", () => {
    vi.stubEnv("R2_PRESIGN_EXPIRES_SEC", "42");
    expect(getPresignExpiresSec()).toBe(900);
    vi.stubEnv("R2_PRESIGN_EXPIRES_SEC", "300");
    expect(getPresignExpiresSec()).toBe(300);
  });

  it("getAllowedMimePrefixesFromEnv supports comma list", () => {
    vi.stubEnv("RELAY_UPLOAD_ALLOWED_MIME_PREFIXES", "model/,text/");
    expect(getAllowedMimePrefixesFromEnv()).toEqual(["model/", "text/"]);
  });
});

/** P8-sec-004 — SigV4 presigned URL expiry matches S3/R2 window semantics (no live R2 call). */
describe("presignedUrlSigningExpiresAt / isPresignedUrlExpired", () => {
  const sample = (date: string, exp: string) =>
    `https://example-account.r2.cloudflarestorage.com/bucket/key?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=x&X-Amz-Date=${date}&X-Amz-Expires=${exp}&X-Amz-SignedHeaders=host&X-Amz-Signature=abc`;

  it("parses X-Amz-Date + X-Amz-Expires into UTC expiry", () => {
    const url = sample("20260115T120000Z", "300");
    const until = presignedUrlSigningExpiresAt(url)!;
    expect(until.toISOString()).toBe("2026-01-15T12:05:00.000Z");
  });

  it("treats a past signing window as expired (replay would be rejected by R2)", () => {
    const url = sample("20000101T000000Z", "60");
    expect(isPresignedUrlExpired(url)).toBe(true);
  });

  it("treats a far-future window as not expired at a fixed before time", () => {
    const url = sample("20990101T000000Z", "60");
    expect(isPresignedUrlExpired(url, new Date("2026-01-01T00:00:00.000Z"))).toBe(false);
  });

  it("returns null / not expired when SigV4 params missing", () => {
    expect(presignedUrlSigningExpiresAt("https://example.com/no-query")).toBeNull();
    expect(isPresignedUrlExpired("https://example.com/no-query")).toBe(false);
  });
});
