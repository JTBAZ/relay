/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postPatreonSyncMembers } from "../../web/lib/relay-api";

vi.mock("../../web/lib/relay-session-logout.ts", () => ({
  performRelayLogout: vi.fn().mockResolvedValue(undefined)
}));

function envelope<T>(data: T) {
  return { data, meta: { trace_id: "trace-mem" } };
}

describe("relay-api sync members", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POST sync-members with creator_id and optional campaign_id", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          envelope({
            creator_id: "cr1",
            patreon_campaign_id: "999",
            members_synced: 12,
            pages_fetched: 1,
            warnings: []
          })
        ),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const out = await postPatreonSyncMembers({
      creator_id: "cr1",
      campaign_id: "999"
    });
    expect(out.members_synced).toBe(12);
    const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
    expect(url).toContain("/api/v1/patreon/sync-members");
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      creator_id: "cr1",
      campaign_id: "999"
    });
  });
});
