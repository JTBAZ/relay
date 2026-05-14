import { describe, expect, it } from "vitest";
import {
  buildSubscribeStarSyncBatch,
  substarCampaignId,
  substarMediaId,
  substarPostId,
  substarTierId
} from "../src/subscribestar/map-subscribestar-to-ingest.js";

describe("map-subscribestar-to-ingest", () => {
  it("prefixes ids idempotently", () => {
    expect(substarCampaignId("42")).toBe("substar_campaign_42");
    expect(substarCampaignId("substar_campaign_42")).toBe("substar_campaign_42");
    expect(substarTierId("9")).toBe("substar_tier_9");
    expect(substarPostId("p1")).toBe("substar_post_p1");
    expect(substarMediaId("m1")).toBe("substar_media_m1");
  });

  it("buildSubscribeStarSyncBatch maps wire to SyncBatchInput", () => {
    const batch = buildSubscribeStarSyncBatch({
      creator_id: "cr_a",
      now_iso: "2026-01-01T00:00:00.000Z",
      campaign: { external_campaign_id: "77", name: "SubStar page" },
      tiers: [{ external_tier_id: "2", title: "Gold", amount_cents: 500 }],
      posts: [
        {
          external_post_id: "1001",
          title: "Hello",
          published_at: "2026-01-02T12:00:00.000Z",
          upstream_revision: "rev-1",
          tier_external_ids: ["2"],
          tag_ids: ["nsfw"],
          media: [
            {
              external_media_id: "500",
              upstream_revision: "m-rev",
              upstream_url: "https://cdn.example/img.jpg",
              mime_type: "image/jpeg"
            }
          ]
        }
      ]
    });

    expect(batch.creator_id).toBe("cr_a");
    expect(batch.campaigns).toHaveLength(1);
    expect(batch.campaigns![0]).toMatchObject({
      campaign_id: "substar_campaign_77",
      name: "SubStar page",
      upstream_updated_at: "2026-01-01T00:00:00.000Z"
    });
    expect(batch.tiers?.[0]).toMatchObject({
      tier_id: "substar_tier_2",
      campaign_id: "substar_campaign_77",
      title: "Gold",
      amount_cents: 500
    });
    expect(batch.posts).toHaveLength(1);
    expect(batch.posts![0]).toMatchObject({
      post_id: "substar_post_1001",
      title: "Hello",
      published_at: "2026-01-02T12:00:00.000Z",
      upstream_revision: "rev-1",
      tier_ids: ["substar_tier_2"],
      tag_ids: ["nsfw"]
    });
    expect(batch.posts![0].media).toHaveLength(1);
    expect(batch.posts![0].media[0]).toMatchObject({
      media_id: "substar_media_500",
      upstream_revision: "m-rev",
      upstream_url: "https://cdn.example/img.jpg",
      mime_type: "image/jpeg"
    });
  });
});
