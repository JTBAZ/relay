/**
 * PUX-arch-001 — normalized tier catalog architecture invariants.
 * Static checks + mapping smoke tests; no live Postgres required.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tierStableId } from "../src/ingest/canonical-store-db.js";
import { resolvePostTierDisplayLabel } from "../src/gallery/tier-display-label.js";
import {
  extractPatronSyncFromIdentity,
  type PatreonIdentityDocument
} from "../src/patreon/patreon-user-identity.js";
import { tierIdsFromPatreonPost } from "../src/patreon/map-patreon-to-ingest.js";
import type { JsonApiResource } from "../src/patreon/jsonapi-types.js";

const SCHEMA = readFileSync(join(__dirname, "../prisma/schema.prisma"), "utf8");

describe("PUX-arch-001 — normalized tier catalog truth", () => {
  it("schema defines Tier, PostVersion.tierIds, and PatronEntitlementSnapshot.entitledTierIds", () => {
    expect(SCHEMA).toMatch(/model Tier \{/);
    expect(SCHEMA).toMatch(/model PostVersion \{/);
    expect(SCHEMA).toMatch(/tierIds\s+String\[\]/);
    expect(SCHEMA).toMatch(/model PatronEntitlementSnapshot \{/);
    expect(SCHEMA).toMatch(/entitledTierIds\s+String\[\]/);
  });

  it("schema has no Patreon JSON entitlement snapshot table for pilot gate decisions", () => {
    expect(SCHEMA).not.toMatch(/model PatreonEntitlementSnapshot/);
    expect(SCHEMA).not.toMatch(/patreon_provider_snapshot/);
    // SubscribeStar debug JSON is provider-specific and not used for Patreon pilot gates.
    expect(SCHEMA).toMatch(/subscribestarProviderSnapshot\s+Json\?/);
  });

  it("TenantMembership.tierIds is documented as non-authoritative for gate decisions", () => {
    expect(SCHEMA).toMatch(/Never consult this column for gate decisions/);
  });

  it("tierStableId produces creator-scoped keys used by Tier.id and PostTier links", () => {
    const id = tierStableId("rcx_creator", "patreon_tier_42");
    expect(id).toBe("rcx_creator::patreon_tier_42");
  });

  it("Patreon post ingest maps upstream tier ids to patreon_tier_* relay keys", () => {
    const resource: JsonApiResource = {
      type: "post",
      id: "99",
      attributes: { tiers: ["123"] }
    };
    expect(tierIdsFromPatreonPost(resource)).toEqual(["patreon_tier_123"]);
  });

  it("PILOT-003 — post tier chips resolve Tier.title from catalog rows", () => {
    const tierCatalog: Record<string, import("../src/ingest/canonical-store.js").TierRow> = {
      patreon_tier_42: {
        tier_id: "patreon_tier_42",
        creator_id: "rcx_creator",
        title: "Gold Patron",
        amount_cents: 1200,
        upstream_updated_at: "2026-01-01T00:00:00.000Z",
        version_seq: 1
      }
    };
    expect(
      resolvePostTierDisplayLabel({
        tierIds: ["patreon_tier_42"],
        tierCatalog
      })
    ).toBe("Gold Patron");
  });

  it("Patreon patron OAuth identity extracts normalized tier_ids array", () => {
    const doc: PatreonIdentityDocument = {
      data: {
        type: "user",
        id: "888",
        attributes: { email: "patron@example.com" }
      },
      included: [
        {
          type: "member",
          id: "m1",
          attributes: { patron_status: "active_patron" },
          relationships: {
            campaign: { data: { type: "campaign", id: "555" } },
            currently_entitled_tiers: {
              data: [{ type: "tier", id: "777" }]
            }
          }
        },
        {
          type: "tier",
          id: "777",
          attributes: { title: "Supporter" }
        }
      ]
    };
    const sync = extractPatronSyncFromIdentity(doc, "555");
    expect(sync.tier_ids).toEqual(["patreon_tier_777"]);
    expect(sync.tier_ids.every((id) => typeof id === "string" && id.startsWith("patreon_tier_"))).toBe(
      true
    );
  });
});
