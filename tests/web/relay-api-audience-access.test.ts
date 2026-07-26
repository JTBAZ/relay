/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { patchPostAudienceAccess } from "../../web/lib/relay-api";

vi.mock("../../web/lib/relay-session-logout.ts", () => ({
  performRelayLogout: vi.fn().mockResolvedValue(undefined)
}));

function envelope<T>(data: T) {
  return { data, meta: { trace_id: "trace-aud" } };
}

describe("relay-api audience access", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCH encodes path and snake_case body for tier gate", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          envelope({
            post_id: "post 9",
            is_public: false,
            tier_ids: ["patreon_tier_gold"],
            source: "PATREON"
          })
        ),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const out = await patchPostAudienceAccess({
      relayCreatorId: "cr1",
      postId: "post 9",
      is_public: false,
      tier_ids: ["tier-prisma-id"]
    });
    expect(out.audience.tier_ids).toEqual(["patreon_tier_gold"]);
    const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
    expect(url).toContain("/api/v1/gallery/posts/post%209/audience-access");
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      creator_id: "cr1",
      is_public: false,
      tier_ids: ["tier-prisma-id"]
    });
  });
});
