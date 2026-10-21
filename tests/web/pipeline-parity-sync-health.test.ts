import { describe, expect, it } from "vitest";
import { evaluatePipelineParity } from "../../web/app/dev/pipeline-parity/evaluateParity";
import type { PatreonSyncStateData } from "../../web/lib/relay-api";

describe("PS14 parity unavailable OAuth", () => {
  it("does not report a missing-token200 DTO as healthy provider verification", () => {
    const state = { creator_id: "creator", patreon_campaign_id: "", availability: "unavailable", unavailable_reason: "missing_tokens",
      watermark_published_at: null, watermark_updated_at: null, has_cookie_session: false,
      oauth: { availability: "unavailable", credential_health_status: "unavailable", access_token_expires_at: null, access_token_expired: null, access_token_expires_soon: null },
      last_post_scrape: null, last_member_sync: null, campaign_display: null,
      sync_health: { status: "unknown", last_success_at: null, last_error: null, campaign_id: null, message_key: "sync_health.unknown" } } as PatreonSyncStateData;
    const nodes = evaluatePipelineParity({ snapshot: null, syncState: state, selectedCreatorId: "creator", selectedCampaignId: undefined,
      browser: { supabaseUserId: null, relayCreatorId: "creator", relaySessionPresent: true, meSessionCreatorId: "creator" } });
    expect(nodes.find((node) => node.id === "creator_oauth")).toMatchObject({ status: "unknown" });
    expect(nodes.find((node) => node.id === "creator_oauth")?.summary).toContain("unavailable");
    expect(nodes.find((node) => node.id === "patreon_cookies")?.status).toBe("unknown");
  });
});
