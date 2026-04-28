import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRelayR2ObjectKey,
  getAllowedMimePrefixesFromEnv,
  getPresignExpiresSec,
  getRelayUploadMaxBytes,
  isMimeTypeAllowed
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
