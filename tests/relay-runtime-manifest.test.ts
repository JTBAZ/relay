import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRelayRuntimeManifest } from "../src/dev/relay-runtime-manifest.js";

describe("buildRelayRuntimeManifest", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("reports the effective production cookie vault instead of always claiming file storage", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("RELAY_DB_STORE_PATREON_COOKIE", "");
    const manifest = buildRelayRuntimeManifest({ prisma: {} as never });
    expect(manifest.patreon_cookie_store?.readPath).toBe("postgres");
    expect(manifest.always_file.patreon_session_cookies).toBe(false);
  });
  it("maps effective flag to readPath for canonical", () => {
    const off = buildRelayRuntimeManifest({ relay_db_store_canonical: false });
    expect(off.relay_db_store.canonical.readPath).toBe("file");
    const on = buildRelayRuntimeManifest({ relay_db_store_canonical: true });
    expect(on.relay_db_store.canonical.readPath).toBe("postgres");
  });

  it("respects creator OAuth override", () => {
    const m = buildRelayRuntimeManifest({ relay_db_store_creator_oauth: true });
    expect(m.relay_db_store.creator_oauth.effective).toBe(true);
    expect(m.relay_db_store.creator_oauth.envVar).toBe("RELAY_DB_STORE_CREATOR_OAUTH");
  });

  it("sets public_webhook_base_configured when config.public_webhook_base_url is set", () => {
    const withUrl = buildRelayRuntimeManifest({
      public_webhook_base_url: "https://relay.example.com"
    });
    expect(withUrl.public_webhook_base_configured).toBe(true);
  });
});
