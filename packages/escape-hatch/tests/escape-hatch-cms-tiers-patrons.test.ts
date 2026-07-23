/**
 * EH-061 — Tiers/patrons CMS (local kit mutations + manual grants).
 */

import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import {
  SITE_BUNDLE_CONTRACT_VERSION,
  parseSiteBundle,
  type SiteBundle
} from "../src/contracts.js";
import {
  upsertManualGrant,
  revokeManualGrant,
  manualGrantsForSubject,
  describeAccessReason
} from "../template/lib/cms/grants.js";
import {
  listActiveCatalogTiers,
  retireTier,
  upsertTier
} from "../template/lib/cms/tiers.js";
import { writeSiteBundleForKit } from "../template/lib/cms/posts.js";
import { buildTierCatalogCards } from "../template/lib/billing/catalog.js";
import { emptyBillingTierMap } from "../template/lib/billing/tier-map.js";
import { evaluateAccess } from "../template/lib/entitlements/evaluate.js";

function minimalBundle(over?: Partial<SiteBundle>): SiteBundle {
  return parseSiteBundle({
    contract_version: SITE_BUNDLE_CONTRACT_VERSION,
    site_id: "site_eh_061",
    creator_id: "creator_eh_061",
    generated_at: "2026-07-23T14:00:00.000Z",
    base_url: "/",
    creator: { display_name: "Test", handle: "test" },
    theme: {
      color_scheme: "light",
      paywall_style: "blur",
      hero: { title: "Test" }
    },
    demo_personas: [{ id: "public", label: "Public", tier_ids: [] }],
    tiers: [
      {
        tier_id: "tier_basic",
        title: "Basic",
        access_level: "tier_gated",
        amount_cents: 500
      },
      {
        tier_id: "tier_pro",
        title: "Pro",
        access_level: "tier_gated",
        amount_cents: 1500
      }
    ],
    posts: [
      {
        post_id: "post_1",
        slug: "gated",
        title: "Gated",
        published_at: "2026-07-01T00:00:00.000Z",
        tag_ids: [],
        access: { level: "tier_gated", tier_ids: ["tier_basic"] },
        media: []
      }
    ],
    total_media: 0,
    ...over
  });
}

describe("EH-061 status", () => {
  it("advances slice to EH-070 with next EH-071 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-070");
    expect(status.slice).toBe("EH-070");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-071");
  });
});

describe("EH-061 tiers + grants CMS", () => {
  it("retires tiers from public catalog while keeping gated post counts", () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh061-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      writeSiteBundleForKit(minimalBundle(), kitDir);

      const updated = upsertTier(
        {
          tier_id: "tier_basic",
          benefit_copy: "Basic benefits",
          retired: false
        },
        kitDir
      );
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.tier.benefit_copy).toBe("Basic benefits");
      expect(updated.affected_posts).toBe(1);

      const retired = retireTier("tier_pro", true, kitDir);
      expect(retired.ok).toBe(true);
      if (!retired.ok) return;
      expect(retired.tier.retired).toBe(true);

      const active = listActiveCatalogTiers([
        updated.tier,
        retired.tier
      ]);
      expect(active.map((t) => t.tier_id)).toEqual(["tier_basic"]);

      const cards = buildTierCatalogCards({
        catalog: [updated.tier, retired.tier],
        map: emptyBillingTierMap("site_eh_061"),
        subject: {
          signedIn: false,
          softPersonaPreview: true,
          effectiveTier: [],
          activeSources: []
        },
        policy: {
          eligible: true,
          category: "standard",
          stripeAllowed: true,
          reasons: [],
          recipes: []
        } as never
      });
      expect(cards.map((c) => c.tierId)).toEqual(["tier_basic"]);
      expect(cards[0]?.benefitCopy).toMatch(/Basic benefits/);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("stores manual grants and feeds the entitlement evaluator", () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh061g-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      const created = upsertManualGrant(
        {
          site_id: "site_eh_061",
          subject_key: "user_demo",
          tier_ids: ["tier_basic"],
          reason: "QA complimentary",
          actor: "operator",
          expires_at: null
        },
        kitDir
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const grants = manualGrantsForSubject("site_eh_061", "user_demo", {
        kitDir
      });
      expect(grants.length).toBe(1);
      expect(grants[0]?.source).toBe("manual");

      const evaluation = evaluateAccess({
        subject: {
          kind: "member",
          userId: "user_demo",
          provider: "portable",
          role: "patron",
          siteId: "site_eh_061"
        },
        resource: {
          type: "post",
          id: "post_1",
          siteId: "site_eh_061",
          accessLevel: "tier_gated",
          tierIds: ["tier_basic"],
          publishedAt: "2026-07-01T00:00:00.000Z"
        },
        grants,
        provider: "portable",
        tierCatalog: {
          tier_basic: { amount_cents: 500, title: "Basic" }
        }
      });
      expect(evaluation.allowed).toBe(true);
      expect(evaluation.reason).toBe("entitlement_grant");
      expect(describeAccessReason(evaluation.reason, evaluation.detail)).toMatch(
        /Active entitlement/i
      );

      const revoked = revokeManualGrant(
        "site_eh_061",
        created.grant.grant_id,
        kitDir
      );
      expect(revoked.ok).toBe(true);
      const after = manualGrantsForSubject("site_eh_061", "user_demo", {
        kitDir
      });
      const denied = evaluateAccess({
        subject: {
          kind: "member",
          userId: "user_demo",
          provider: "portable",
          role: "patron",
          siteId: "site_eh_061"
        },
        resource: {
          type: "post",
          id: "post_1",
          siteId: "site_eh_061",
          accessLevel: "tier_gated",
          tierIds: ["tier_basic"],
          publishedAt: "2026-07-01T00:00:00.000Z"
        },
        grants: after,
        provider: "portable",
        tierCatalog: {
          tier_basic: { amount_cents: 500, title: "Basic" }
        }
      });
      expect(denied.allowed).toBe(false);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });
});
