import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getPatreonOAuthStateSecret,
  signCreatorPatreonOAuthState,
  verifyCreatorPatreonOAuthState
} from "../src/auth/patreon-creator-oauth-state.js";

describe("patreon-creator-oauth-state (MT-011)", () => {
  const prev = process.env.RELAY_PATREON_OAUTH_STATE_SECRET;

  beforeEach(() => {
    process.env.RELAY_PATREON_OAUTH_STATE_SECRET = "test_secret_min_len_ok";
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.RELAY_PATREON_OAUTH_STATE_SECRET;
    } else {
      process.env.RELAY_PATREON_OAUTH_STATE_SECRET = prev;
    }
  });

  it("round-trips sign + verify", () => {
    expect(getPatreonOAuthStateSecret()).toBeTruthy();
    const { state } = signCreatorPatreonOAuthState({
      accountId: "acc_1",
      creatorId: "creator_a"
    });
    const v = verifyCreatorPatreonOAuthState(state, "acc_1", "creator_a");
    expect(v.ok).toBe(true);
  });

  it("rejects wrong account", () => {
    const { state } = signCreatorPatreonOAuthState({
      accountId: "acc_1",
      creatorId: "creator_a"
    });
    const v = verifyCreatorPatreonOAuthState(state, "acc_2", "creator_a");
    expect(v.ok).toBe(false);
  });

  it("rejects wrong creator_id", () => {
    const { state } = signCreatorPatreonOAuthState({
      accountId: "acc_1",
      creatorId: "creator_a"
    });
    const v = verifyCreatorPatreonOAuthState(state, "acc_1", "creator_b");
    expect(v.ok).toBe(false);
  });
});
