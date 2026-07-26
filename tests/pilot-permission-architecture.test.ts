/**
 * PUX-arch-002 / PILOT-004 — three-layer permission model invariants.
 * Static checks + unit smoke tests; no live Postgres required.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluatePostPermission } from "../src/gallery/post-permission.js";
import { hiddenPostIdsFromOverridesRoot } from "../src/gallery/hidden-post-ids.js";
import type { GalleryOverridesRoot } from "../src/gallery/types.js";
import type { GalleryOverridesStore } from "../src/gallery/overrides-store.js";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import type { SessionToken } from "../src/identity/types.js";

const SCHEMA = readFileSync(join(__dirname, "../prisma/schema.prisma"), "utf8");
const OVERRIDES_STORE_TS = readFileSync(
  join(__dirname, "../src/gallery/overrides-store.ts"),
  "utf8"
);
const OVERRIDES_TYPES_TS = readFileSync(join(__dirname, "../src/gallery/types.ts"), "utf8");
const POST_PERMISSION_TS = readFileSync(
  join(__dirname, "../src/gallery/post-permission.ts"),
  "utf8"
);
const ASSEMBLE_FEED_TS = readFileSync(
  join(__dirname, "../src/patron/assemble-patron-feed.ts"),
  "utf8"
);
const AUDIENCE_GATE_TS = readFileSync(
  join(__dirname, "../src/relay/update-post-audience-tier-gate.ts"),
  "utf8"
);

const creatorId = "cr_arch";
const postId = "post_arch";
const now = "2026-05-20T12:00:00.000Z";

function tierSnap(postTierIds: string[]): CanonicalSnapshot {
  return {
    ingest_idempotency: {},
    campaigns: {},
    tiers: {
      [creatorId]: {
        patreon_tier_low: {
          tier_id: "patreon_tier_low",
          creator_id: creatorId,
          campaign_id: "camp1",
          title: "Supporter",
          amount_cents: 500,
          upstream_updated_at: now,
          version_seq: 1
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
            title: "Gated",
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

const entitledSession: SessionToken = {
  token: "t",
  user_id: "patron1",
  creator_id: creatorId,
  tier_ids: ["patreon_tier_low"],
  expires_at: "2099-01-01T00:00:00.000Z"
};

describe("PUX-arch-002 — three-layer permission model", () => {
  it("PostOverride schema has no tier gate fields", () => {
    const block = SCHEMA.slice(
      SCHEMA.indexOf("model PostOverride"),
      SCHEMA.indexOf("/// Relay-controlled presentation overlays")
    );
    expect(block).toMatch(/model PostOverride \{/);
    expect(block).not.toMatch(/\btierIds\b/);
    expect(block).not.toMatch(/\btier_ids\b/);
    expect(block).toMatch(/addTagIds/);
    expect(block).toMatch(/visibility/);
    expect(block).toMatch(/discoveryEligible/);
  });

  it("PostOverride TS type and overrides store contract exclude tier ids", () => {
    const postOverrideBlock = OVERRIDES_TYPES_TS.slice(
      OVERRIDES_TYPES_TS.indexOf("export type PostOverride"),
      OVERRIDES_TYPES_TS.indexOf("export type PostTagOverride")
    );
    expect(postOverrideBlock).not.toMatch(/\btier_ids\b/);
    expect(postOverrideBlock).not.toMatch(/\btierIds\b/);

    const storeIface = OVERRIDES_STORE_TS.slice(
      OVERRIDES_STORE_TS.indexOf("export interface GalleryOverridesStore"),
      OVERRIDES_STORE_TS.indexOf("export function compactMediaOverride")
    );
    expect(storeIface).not.toMatch(/\btier/i);
    expect(storeIface).toMatch(/setVisibility/);
    expect(storeIface).toMatch(/setDiscoveryEligible/);

    // Compile-time guard: GalleryOverridesStore must not expose tier mutation.
    type StoreKeys = keyof GalleryOverridesStore;
    type Forbidden = Extract<StoreKeys, `setTier${string}` | `mergeTier${string}`>;
    const _noTierMethods: Forbidden extends never ? true : false = true;
    expect(_noTierMethods).toBe(true);
  });

  it("updatePostAudienceTierGate writes Layer A only (PostVersion.tierIds), not overrides", () => {
    expect(AUDIENCE_GATE_TS).toMatch(/postVersion\.update/);
    expect(AUDIENCE_GATE_TS).toMatch(/tierIds/);
    expect(AUDIENCE_GATE_TS).not.toMatch(/PostOverride/);
    expect(AUDIENCE_GATE_TS).not.toMatch(/overrides/i);
  });

  it("evaluatePostPermission checks hidden (Layer C) before tier allow (A×B)", () => {
    const fnBody = POST_PERMISSION_TS.slice(
      POST_PERMISSION_TS.indexOf("export function evaluatePostPermission"),
      POST_PERMISSION_TS.indexOf("export function evaluatePostPermission") + 2500
    );
    const ownerIdx = fnBody.indexOf("isContentOwner && session");
    const hiddenIdx = fnBody.indexOf('relayPostVisibility === "hidden"');
    const tierIdx = fnBody.indexOf("evaluateTierRules(tierMap)");
    expect(ownerIdx).toBeGreaterThan(-1);
    expect(hiddenIdx).toBeGreaterThan(ownerIdx);
    expect(tierIdx).toBeGreaterThan(hiddenIdx);

    const snapshot = tierSnap(["patreon_tier_low"]);
    expect(
      evaluatePostPermission({
        snapshot,
        creatorId,
        postId,
        session: entitledSession,
        relayPostVisibility: "hidden"
      })
    ).toEqual({ outcome: "deny", reason: "Post hidden by creator." });
    expect(
      evaluatePostPermission({
        snapshot,
        creatorId,
        postId,
        session: entitledSession
      })
    ).toEqual({ outcome: "allow" });
  });

  it("hiddenPostIdsFromOverridesRoot collects Layer C hidden posts only", () => {
    const root: GalleryOverridesRoot = {
      creators: {
        [creatorId]: {
          posts: {
            visible_post: { add_tag_ids: [], remove_tag_ids: [], visibility: "visible" },
            hidden_post: { add_tag_ids: [], remove_tag_ids: [], visibility: "hidden" },
            tagged_only: { add_tag_ids: ["tag_a"], remove_tag_ids: [] }
          }
        }
      }
    };
    expect([...hiddenPostIdsFromOverridesRoot(root, creatorId)]).toEqual(["hidden_post"]);
  });

  it("assemblePatronFeed applies hidden filter before tier entitlement check", () => {
    const fnBody = ASSEMBLE_FEED_TS.slice(
      ASSEMBLE_FEED_TS.indexOf("export async function assemblePatronFeed"),
      ASSEMBLE_FEED_TS.indexOf("export async function assemblePatronFeed") + 12000
    );
    expect(fnBody).toMatch(/loadHiddenPostIdsByCreator/);
    const hiddenCheck = fnBody.indexOf("hiddenPostIdsByCreator.get(post.creatorId)?.has(post.id)");
    const tierCheck = fnBody.indexOf("canAccessPost(postAccess, entitled, tierCatalog)");
    expect(hiddenCheck).toBeGreaterThan(-1);
    expect(tierCheck).toBeGreaterThan(hiddenCheck);
  });
});
