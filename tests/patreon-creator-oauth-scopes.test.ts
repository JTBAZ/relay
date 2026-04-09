import { describe, expect, it } from "vitest";
import { PATREON_CREATOR_OAUTH_SCOPES } from "../src/patreon/patreon-creator-oauth-scopes.js";

describe("PATREON_CREATOR_OAUTH_SCOPES", () => {
  it("includes scopes required for posts, campaigns, and members with email", () => {
    expect(PATREON_CREATOR_OAUTH_SCOPES).toContain("identity");
    expect(PATREON_CREATOR_OAUTH_SCOPES).toContain("campaigns.posts");
    expect(PATREON_CREATOR_OAUTH_SCOPES).toContain("campaigns.members");
    expect(PATREON_CREATOR_OAUTH_SCOPES).toContain("campaigns.members[email]");
    expect(PATREON_CREATOR_OAUTH_SCOPES).toContain("w:campaigns.webhook");
  });
});
