import { describe, expect, it } from "vitest";
import { patronMayFetchMediaExport } from "../src/gallery/patron-media-access.js";
import { shouldApplyMediaExportEntitlementGates } from "../src/gallery/media-export-access-context.js";
import type { SessionToken } from "../src/identity/types.js";
import { RELAY_TIER_PUBLIC } from "../src/patreon/relay-access-tiers.js";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";

const creatorId = "rc_owner";
const postId = "relay_p_1";
const mediaId = "relay_m_1";
const now = "2026-01-01T00:00:00.000Z";

function snapshotWithPost(tierIds: string[]): CanonicalSnapshot {
  return {
    ingest_idempotency: {},
    campaigns: {},
    tiers: {
      [creatorId]: {
        patreon_tier_555: {
          tier_id: "patreon_tier_555",
          creator_id: creatorId,
          title: "Tier",
          amount_cents: 500,
          patron_count: 1,
          published: true,
          upstream_status: "active",
          current: {
            version_seq: 1,
            upstream_revision: "r1",
            ingested_at: now
          },
          versions: []
        }
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
            title: "Paid",
            published_at: now,
            tag_ids: [],
            tier_ids: tierIds,
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
            mime_type: "image/jpeg",
            ingested_at: now
          },
          versions: []
        }
      }
    }
  };
}

describe("shouldApplyMediaExportEntitlementGates", () => {
  it("skips gates for content owners even with an extension grant session", () => {
    const session: SessionToken = {
      token: "t",
      user_id: "membership_1",
      creator_id: "platform",
      tier_ids: [],
      expires_at: "2099-01-01T00:00:00.000Z",
      kind: "extension"
    };
    expect(
      shouldApplyMediaExportEntitlementGates({
        session,
        exportRequireTierAccess: true,
        isContentOwner: true
      })
    ).toBe(false);
  });

  it("applies gates for non-owner authenticated sessions when tier access is required", () => {
    const session: SessionToken = {
      token: "t",
      user_id: "membership_1",
      creator_id: creatorId,
      tier_ids: [],
      expires_at: "2099-01-01T00:00:00.000Z"
    };
    expect(
      shouldApplyMediaExportEntitlementGates({
        session,
        exportRequireTierAccess: true,
        isContentOwner: false
      })
    ).toBe(true);
  });
});

describe("patronMayFetchMediaExport content-owner bypass for extension cross-post", () => {
  it("allows content owner with empty extension tiers on tier-gated media", () => {
    const session: SessionToken = {
      token: "t",
      user_id: "membership_1",
      creator_id: "platform",
      tier_ids: [],
      expires_at: "2099-01-01T00:00:00.000Z",
      kind: "extension"
    };
    const r = patronMayFetchMediaExport({
      snapshot: snapshotWithPost(["patreon_tier_555"]),
      creatorId,
      mediaId,
      session,
      isContentOwner: true
    });
    expect(r).toEqual({ allowed: true });
  });

  it("allows content owner on public media without applying patron tiers", () => {
    const session: SessionToken = {
      token: "t",
      user_id: "membership_1",
      creator_id: "platform",
      tier_ids: [],
      expires_at: "2099-01-01T00:00:00.000Z",
      kind: "extension"
    };
    const r = patronMayFetchMediaExport({
      snapshot: snapshotWithPost([RELAY_TIER_PUBLIC]),
      creatorId,
      mediaId,
      session,
      isContentOwner: true
    });
    expect(r).toEqual({ allowed: true });
  });
});
