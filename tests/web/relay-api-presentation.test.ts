/** @vitest-environment happy-dom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  patchPostPresentation,
  type PostPresentationRecord,
  type PatchPostPresentationInput
} from "../../web/lib/relay-api";

vi.mock("../../web/lib/relay-session-logout.ts", () => ({
  performRelayLogout: vi.fn().mockResolvedValue(undefined)
}));

function envelope<T>(data: T) {
  return { data, meta: { trace_id: "trace-p" } };
}

describe("relay-api presentation (BO-RPB-06)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCH encodes path and snake_case body for overlay fields", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify(
          envelope({
            presentation: {
              post_id: "post 1",
              relay_title: "T",
              relay_description: null,
              media_order: ["a"],
              tier_preview_settings: null,
              updated_at: "2026-04-29T12:00:00.000Z"
            }
          })
        ),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const payload: PatchPostPresentationInput = {
      relayCreatorId: "cr1",
      postId: "post 1",
      relay_title: "T",
      media_order: ["a"]
    };
    const out = await patchPostPresentation(payload);
    expect(out.presentation.post_id).toBe("post 1");
    const url = vi.mocked(fetch).mock.calls[0]?.[0] as string;
    expect(url).toContain("/api/v1/gallery/posts/post%201/presentation");
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      creator_id: "cr1",
      relay_title: "T",
      media_order: ["a"]
    });
  });

  it("types expose PostPresentationRecord for consumers", async () => {
    const rec: PostPresentationRecord = {
      post_id: "p",
      relay_title: null,
      relay_description: null,
      media_order: [],
      tier_preview_settings: { tiers: {} },
      updated_at: "2026-01-01T00:00:00.000Z"
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(envelope({ presentation: rec })), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const got = await patchPostPresentation({
      relayCreatorId: "c",
      postId: "p",
      tier_preview_settings: { tiers: {} }
    });
    expect(got.presentation.tier_preview_settings).toEqual({ tiers: {} });
  });
});
