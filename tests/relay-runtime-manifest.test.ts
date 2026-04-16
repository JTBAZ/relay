import { describe, expect, it } from "vitest";
import { buildRelayRuntimeManifest } from "../src/dev/relay-runtime-manifest.js";

describe("buildRelayRuntimeManifest", () => {
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
