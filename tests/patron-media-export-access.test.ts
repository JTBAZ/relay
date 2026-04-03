import { describe, expect, it } from "vitest";
import { RELAY_TIER_ALL_PATRONS, RELAY_TIER_PUBLIC } from "../src/patreon/relay-access-tiers.js";
import { patronMayFetchMediaExport } from "../src/gallery/patron-media-access.js";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import type { SessionToken } from "../src/identity/types.js";

const creatorId = "cr_test";
const now = "2026-01-01T00:00:00.000Z";

function tierRow(tier_id: string): CanonicalSnapshot["tiers"][string][string] {
  return {
    tier_id,
    creator_id: creatorId,
    campaign_id: "camp1",
    title: "Tier",
    upstream_updated_at: now,
    version_seq: 1
  };
}

function snapshotWithPost(tier_ids: string[]): CanonicalSnapshot {
  const postId = "patreon_post_1";
  const mediaId = "patreon_media_m1";
  return {
    ingest_idempotency: {},
    campaigns: {},
    tiers: {
      [creatorId]: {
        patreon_tier_555: tierRow("patreon_tier_555")
      }
    },
    posts: {
      [creatorId]: {
        [postId]: {
          post_id: postId,
          creator_id: creatorId,
          upstream_status: "active",
          current: {
            version_seq: 1,
            upstream_revision: "r1",
            title: "Post",
            published_at: now,
            tag_ids: [],
            tier_ids,
            media_ids: [mediaId],
            ingested_at: now
          },
          versions: []
        }
      }
    },
    media: {
      [creatorId]: {
        [mediaId]: {
          media_id: mediaId,
          creator_id: creatorId,
          post_ids: [postId],
          upstream_status: "active",
          current: {
            version_seq: 1,
            upstream_revision: "r1",
            mime_type: "image/png",
            ingested_at: now
          },
          versions: []
        }
      }
    }
  };
}

describe("patronMayFetchMediaExport", () => {
  it("denies anonymous export for tier-gated post", () => {
    const snap = snapshotWithPost(["patreon_tier_555"]);
    const r = patronMayFetchMediaExport({
      snapshot: snap,
      creatorId,
      mediaId: "patreon_media_m1",
      session: null
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reason).toMatch(/Authentication required/i);
    }
  });

  it("allows patron with entitled tier to export tier-gated media", () => {
    const snap = snapshotWithPost(["patreon_tier_555"]);
    const session: SessionToken = {
      token: "t",
      user_id: "u1",
      creator_id: creatorId,
      tier_ids: ["patreon_tier_555"],
      expires_at: "2099-01-01T00:00:00.000Z"
    };
    const r = patronMayFetchMediaExport({
      snapshot: snap,
      creatorId,
      mediaId: "patreon_media_m1",
      session
    });
    expect(r).toEqual({ allowed: true });
  });

  it("denies patron missing tier for tier-gated post", () => {
    const snap = snapshotWithPost(["patreon_tier_555"]);
    const session: SessionToken = {
      token: "t",
      user_id: "u1",
      creator_id: creatorId,
      tier_ids: ["patreon_tier_999"],
      expires_at: "2099-01-01T00:00:00.000Z"
    };
    const r = patronMayFetchMediaExport({
      snapshot: snap,
      creatorId,
      mediaId: "patreon_media_m1",
      session
    });
    expect(r.allowed).toBe(false);
  });

  it("allows anonymous export only when post resolves to public", () => {
    const snap = snapshotWithPost([RELAY_TIER_PUBLIC]);
    const r = patronMayFetchMediaExport({
      snapshot: snap,
      creatorId,
      mediaId: "patreon_media_m1",
      session: null
    });
    expect(r).toEqual({ allowed: true });
  });

  it("denies anonymous for member_only synthetic tier", () => {
    const snap = snapshotWithPost([RELAY_TIER_ALL_PATRONS]);
    const r = patronMayFetchMediaExport({
      snapshot: snap,
      creatorId,
      mediaId: "patreon_media_m1",
      session: null
    });
    expect(r.allowed).toBe(false);
  });

  it("allows any authenticated patron for member_only when session has tiers", () => {
    const snap = snapshotWithPost([RELAY_TIER_ALL_PATRONS]);
    const session: SessionToken = {
      token: "t",
      user_id: "u1",
      creator_id: creatorId,
      tier_ids: ["patreon_tier_555"],
      expires_at: "2099-01-01T00:00:00.000Z"
    };
    const r = patronMayFetchMediaExport({
      snapshot: snap,
      creatorId,
      mediaId: "patreon_media_m1",
      session
    });
    expect(r).toEqual({ allowed: true });
  });
});
