import { describe, expect, it } from "vitest";
import { RELAY_TIER_PUBLIC } from "../src/patreon/relay-access-tiers.js";
import { evaluatePostPermission } from "../src/gallery/post-permission.js";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import type { SessionToken } from "../src/identity/types.js";

const creatorId = "cr_perm";
const now = "2026-02-01T00:00:00.000Z";

function snap(
  postTierIds: string[],
  tierMap: NonNullable<CanonicalSnapshot["tiers"][string]>
): CanonicalSnapshot {
  const postId = "post_p1";
  return {
    ingest_idempotency: {},
    campaigns: {},
    tiers: { [creatorId]: tierMap },
    posts: {
      [creatorId]: {
        [postId]: {
          post_id: postId,
          creator_id: creatorId,
          upstream_status: "active",
          current: {
            version_seq: 1,
            upstream_revision: "r1",
            title: "Hi",
            published_at: now,
            tag_ids: [],
            tier_ids: postTierIds,
            media_ids: [],
            ingested_at: now
          },
          versions: []
        }
      }
    },
    media: {}
  };
}

const tier = (id: string, cents: number) => ({
  tier_id: id,
  creator_id: creatorId,
  campaign_id: "camp1",
  title: id,
  amount_cents: cents,
  upstream_updated_at: now,
  version_seq: 1
});

describe("evaluatePostPermission (MIG-41)", () => {
  it("allow — public post without session", () => {
    const snapshot = snap([RELAY_TIER_PUBLIC], { x: tier("x", 0) });
    expect(
      evaluatePostPermission({
        snapshot,
        creatorId,
        postId: "post_p1",
        session: null
      })
    ).toEqual({ outcome: "allow" });
  });

  it("deny — anonymous on paid post", () => {
    const snapshot = snap(["patreon_tier_low"], {
      patreon_tier_low: tier("patreon_tier_low", 500)
    });
    const r = evaluatePostPermission({
      snapshot,
      creatorId,
      postId: "post_p1",
      session: null
    });
    expect(r).toEqual({ outcome: "deny", reason: "Authentication required." });
  });

  it("locked_preview — session for creator but insufficient tier", () => {
    const snapshot = snap(["patreon_tier_high"], {
      patreon_tier_low: tier("patreon_tier_low", 500),
      patreon_tier_high: tier("patreon_tier_high", 3000)
    });
    const session: SessionToken = {
      token: "t",
      user_id: "u1",
      creator_id: creatorId,
      tier_ids: ["patreon_tier_low"],
      expires_at: "2099-01-01T00:00:00.000Z"
    };
    const r = evaluatePostPermission({
      snapshot,
      creatorId,
      postId: "post_p1",
      session
    });
    expect(r).toEqual({
      outcome: "locked_preview",
      reason: "Insufficient tier access."
    });
  });

  it("allow — higher tier satisfies lower post gate", () => {
    const snapshot = snap(["patreon_tier_low"], {
      patreon_tier_low: tier("patreon_tier_low", 500),
      patreon_tier_high: tier("patreon_tier_high", 3000)
    });
    const session: SessionToken = {
      token: "t",
      user_id: "u1",
      creator_id: creatorId,
      tier_ids: ["patreon_tier_high"],
      expires_at: "2099-01-01T00:00:00.000Z"
    };
    expect(
      evaluatePostPermission({
        snapshot,
        creatorId,
        postId: "post_p1",
        session
      })
    ).toEqual({ outcome: "allow" });
  });

  it("returns null when post missing", () => {
    const snapshot = snap([RELAY_TIER_PUBLIC], {});
    expect(
      evaluatePostPermission({
        snapshot,
        creatorId,
        postId: "missing",
        session: null
      })
    ).toBeNull();
  });
});
