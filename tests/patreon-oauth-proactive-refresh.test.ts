import { describe, expect, it } from "vitest";
import {
  needsProactivePatreonRefresh,
  PATREON_PROACTIVE_REFRESH_MARGIN_MS
} from "../src/auth/auth-service.js";
import type { PersistedPatreonTokens } from "../src/auth/token-store.js";

function cred(partial: Partial<PersistedPatreonTokens>): PersistedPatreonTokens {
  return {
    creator_id: "c",
    access_token: "a",
    refresh_token: "r",
    access_token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    credential_health_status: "healthy",
    ...partial
  };
}

describe("needsProactivePatreonRefresh", () => {
  it("is true when credential_health_status is refresh_failed", () => {
    expect(needsProactivePatreonRefresh(cred({ credential_health_status: "refresh_failed" }))).toBe(
      true
    );
  });

  it("is true when expiry is within the proactive margin", () => {
    expect(
      needsProactivePatreonRefresh(
        cred({
          access_token_expires_at: new Date(
            Date.now() + PATREON_PROACTIVE_REFRESH_MARGIN_MS - 60_000
          ).toISOString()
        })
      )
    ).toBe(true);
  });

  it("is false when healthy and expiry is beyond the proactive margin", () => {
    expect(
      needsProactivePatreonRefresh(
        cred({
          access_token_expires_at: new Date(
            Date.now() + PATREON_PROACTIVE_REFRESH_MARGIN_MS + 60_000
          ).toISOString()
        })
      )
    ).toBe(false);
  });

  it("is true when access_token_expires_at is unparseable", () => {
    expect(needsProactivePatreonRefresh(cred({ access_token_expires_at: "not-a-date" }))).toBe(true);
  });
});
