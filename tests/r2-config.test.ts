import { afterEach, describe, expect, it, vi } from "vitest";
import { getR2ClientConfigFromEnv } from "../src/storage/r2-config.js";

describe("getR2ClientConfigFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when credentials or bucket missing", () => {
    vi.stubEnv("R2_ACCESS_KEY_ID", "");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "s");
    vi.stubEnv("R2_BUCKET", "b");
    expect(getR2ClientConfigFromEnv()).toBeNull();
  });

  it("returns null when endpoint cannot be derived", () => {
    vi.stubEnv("R2_ACCESS_KEY_ID", "k");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "s");
    vi.stubEnv("R2_BUCKET", "my-bucket");
    vi.stubEnv("R2_ACCOUNT_ID", "");
    vi.stubEnv("R2_ENDPOINT", "");
    expect(getR2ClientConfigFromEnv()).toBeNull();
  });

  it("builds endpoint from R2_ACCOUNT_ID", () => {
    vi.stubEnv("R2_ACCOUNT_ID", "abc123");
    vi.stubEnv("R2_ACCESS_KEY_ID", "key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("R2_BUCKET", "bucket1");
    const c = getR2ClientConfigFromEnv();
    expect(c).not.toBeNull();
    expect(c!.endpoint).toBe("https://abc123.r2.cloudflarestorage.com");
    expect(c!.bucket).toBe("bucket1");
    expect(c!.region).toBe("auto");
  });

  it("prefers R2_ENDPOINT when set", () => {
    vi.stubEnv("R2_ACCOUNT_ID", "ignored");
    vi.stubEnv("R2_ENDPOINT", "https://custom.example.com");
    vi.stubEnv("R2_ACCESS_KEY_ID", "key");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "secret");
    vi.stubEnv("R2_BUCKET", "b");
    expect(getR2ClientConfigFromEnv()!.endpoint).toBe("https://custom.example.com");
  });
});
