import { describe, expect, it } from "vitest";
import { classifyPatreonOAuthError } from "../../src/patreon/patreon-oauth-errors.js";

describe("classifyPatreonOAuthError", () => {
  it("classifies reused/expired codes", () => {
    const c = classifyPatreonOAuthError(new Error("Patreon token request failed with status 401"));
    expect(c.publicCode).toBe("expired_or_reused_code");
    expect(c.httpStatus).toBe(409);
  });

  it("classifies app suspended", () => {
    const c = classifyPatreonOAuthError(new Error("PublicApiClientAppSuspendedException"));
    expect(c.publicCode).toBe("app_suspended");
  });

  it("classifies campaign conflicts", () => {
    const c = classifyPatreonOAuthError(
      new Error("That Patreon campaign is already registered to a different Relay studio.")
    );
    expect(c.publicCode).toBe("campaign_conflict");
    expect(c.httpStatus).toBe(409);
  });

  it("classifies wrong Patreon account", () => {
    const c = classifyPatreonOAuthError(
      new Error("The Patreon account you used doesn’t match the one already connected to this studio.")
    );
    expect(c.publicCode).toBe("wrong_patreon_account");
  });
});
