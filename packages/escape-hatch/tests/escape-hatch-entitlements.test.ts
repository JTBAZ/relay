/**
 * EH-032 Entitlement service: evaluateAccess grant-merge matrix,
 * freshness rules, soft-persona honesty, SQL review (no live DB).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ESCAPE_HATCH_SLICE,
  buildEscapeHatchStatus
} from "../src/status.js";
import { evaluateAccess } from "../template/lib/entitlements/evaluate.js";
import {
  grantFromSnapshot,
  mergeEntitlementGrants
} from "../template/lib/entitlements/merge.js";
import {
  DEFAULT_FRESHNESS_POLICY,
  computeDefaultStaleAfter,
  isGrantStale,
  shouldWarnFreshness
} from "../template/lib/entitlements/freshness.js";
import type {
  AccessResource,
  EntitlementGrant
} from "../template/lib/entitlements/types.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = join(PACKAGE_ROOT, "template");

const SITE = "site_eh_032";

function premiumPost(overrides?: Partial<AccessResource & { type: "post" }>): AccessResource {
  return {
    type: "post",
    id: "post_premium",
    siteId: SITE,
    accessLevel: "member_only",
    tierIds: [],
    publishedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function tierGatedPost(tierIds: string[]): AccessResource {
  return {
    type: "post",
    id: "post_tier",
    siteId: SITE,
    accessLevel: "tier_gated",
    tierIds,
    matchMode: "exact",
    publishedAt: "2026-01-01T00:00:00.000Z"
  };
}

function activeGrant(
  source: EntitlementGrant["source"],
  tierIds: string[],
  extra?: Partial<EntitlementGrant>
): EntitlementGrant {
  return grantFromSnapshot({
    source,
    tierIds,
    observedAt: "2099-01-01T00:00:00.000Z",
    staleAfter: "2099-12-31T00:00:00.000Z",
    reason: "test",
    ...extra
  });
}

describe("EH-032 status", () => {
  it("advances slice to EH-043 with next EH-050 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-043");
    expect(status.slice).toBe("EH-043");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-050");
    expect(status.nextSlice.title).toMatch(/Billing|provider|contract/i);
    expect(status.blockers.some((b) => /EH-032/i.test(b))).toBe(false);
    expect(status.blockers.some((b) => /Milestone 3|security review|browser personas/i.test(b))).toBe(true);

    const cap = status.capabilities.find((c) => c.id === "entitlement-evaluator");
    expect(cap?.state).toBe("preview_only");
    expect(cap?.evidence).toMatch(/evaluateAccess|grant merge/i);
    expect(cap?.evidence).toMatch(/EH-033|media delivery|productionSafe remains false/i);
    expect(cap?.evidence).toMatch(/productionSafe remains false/i);
    expect(cap?.nextSlice).toBe("EH-050");
    expect(cap?.sourcePaths).toEqual(
      expect.arrayContaining([
        "packages/escape-hatch/template/lib/entitlements/evaluate.ts",
        "packages/escape-hatch/tests/escape-hatch-entitlements.test.ts"
      ])
    );
  });
});

describe("EH-032 evaluateAccess grant-merge matrix", () => {
  const nowMs = Date.parse("2026-07-22T12:00:00.000Z");

  it("allows public resources for anonymous", () => {
    const result = evaluateAccess({
      subject: { kind: "anonymous" },
      resource: {
        type: "post",
        id: "p1",
        siteId: SITE,
        accessLevel: "public",
        tierIds: [],
        publishedAt: "2026-01-01T00:00:00.000Z"
      },
      provider: "supabase",
      nowMs
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("public_resource");
  });

  it("allows staff override for premium and admin surfaces", () => {
    const premium = evaluateAccess({
      subject: {
        kind: "staff",
        userId: "u_admin",
        provider: "supabase",
        role: "admin",
        siteId: SITE
      },
      resource: premiumPost(),
      provider: "supabase",
      nowMs
    });
    expect(premium.allowed).toBe(true);
    expect(premium.reason).toBe("staff_override");

    const admin = evaluateAccess({
      subject: {
        kind: "staff",
        userId: "u_admin",
        provider: "portable",
        role: "operator",
        siteId: SITE
      },
      resource: { type: "admin_surface", siteId: SITE, surface: "posts" },
      provider: "portable",
      nowMs
    });
    expect(admin.allowed).toBe(true);
    expect(admin.reason).toBe("staff_override");
  });

  it("allows entitled member via merged patreon/billing/manual grants", () => {
    const result = evaluateAccess({
      subject: {
        kind: "member",
        userId: "u_patron",
        provider: "supabase",
        role: "patron",
        siteId: SITE
      },
      resource: tierGatedPost(["t_gold"]),
      grants: [
        activeGrant("patreon", ["t_silver"]),
        activeGrant("billing", ["t_gold"]),
        {
          source: "manual",
          tierIds: ["t_bronze"],
          status: "expired",
          observedAt: "2020-01-01T00:00:00.000Z",
          staleAfter: null,
          expiresAt: "2020-02-01T00:00:00.000Z",
          revokedAt: null,
          reason: "expired trial"
        }
      ],
      provider: "supabase",
      nowMs
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("entitlement_grant");
    expect(result.grants.some((g) => g.source === "billing")).toBe(true);
  });

  it("denies expired, revoked, and stale grants (fail-closed)", () => {
    const base = {
      subject: {
        kind: "member" as const,
        userId: "u_patron",
        provider: "supabase" as const,
        role: "patron" as const,
        siteId: SITE
      },
      resource: premiumPost(),
      provider: "supabase" as const,
      nowMs
    };

    const expired = evaluateAccess({
      ...base,
      grants: [
        {
          source: "manual",
          tierIds: ["t_gold"],
          status: "active",
          observedAt: "2020-01-01T00:00:00.000Z",
          staleAfter: null,
          expiresAt: "2020-06-01T00:00:00.000Z",
          revokedAt: null,
          reason: "temp"
        }
      ]
    });
    expect(expired.allowed).toBe(false);
    expect(expired.reason).toBe("entitlement_expired");

    const revoked = evaluateAccess({
      ...base,
      grants: [
        {
          source: "patreon",
          tierIds: ["t_gold"],
          status: "active",
          observedAt: "2099-01-01T00:00:00.000Z",
          staleAfter: "2099-12-31T00:00:00.000Z",
          expiresAt: null,
          revokedAt: "2026-01-01T00:00:00.000Z",
          reason: "revoked"
        }
      ]
    });
    expect(revoked.allowed).toBe(false);
    expect(revoked.reason).toBe("entitlement_revoked");

    const stale = evaluateAccess({
      ...base,
      grants: [
        {
          source: "patreon",
          tierIds: ["t_gold"],
          status: "active",
          observedAt: "2020-01-01T00:00:00.000Z",
          staleAfter: "2020-01-02T00:00:00.000Z",
          expiresAt: null,
          revokedAt: null,
          reason: "stale poll"
        }
      ]
    });
    expect(stale.allowed).toBe(false);
    expect(stale.reason).toBe("entitlement_stale");
    expect(stale.stale).toBe(true);
  });

  it("denies anonymous when provider configured", () => {
    const result = evaluateAccess({
      subject: { kind: "anonymous" },
      resource: premiumPost(),
      provider: "portable",
      nowMs
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("anonymous_denied");
  });

  it("denies soft persona when provider is configured", () => {
    const result = evaluateAccess({
      subject: {
        kind: "soft_persona",
        personaId: "patron",
        tierIds: ["t_gold", "t_platinum"]
      },
      resource: premiumPost(),
      provider: "supabase",
      nowMs
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("soft_persona_blocked");
  });

  it("ignores soft_persona-sourced grants when provider is configured", () => {
    const result = evaluateAccess({
      subject: {
        kind: "member",
        userId: "u_patron",
        provider: "supabase",
        role: "patron",
        siteId: SITE
      },
      resource: premiumPost(),
      grants: [
        {
          source: "soft_persona",
          tierIds: ["t_gold"],
          status: "active",
          observedAt: "2099-01-01T00:00:00.000Z",
          staleAfter: "2099-12-31T00:00:00.000Z",
          expiresAt: null,
          revokedAt: null,
          reason: "injected"
        }
      ],
      provider: "supabase",
      nowMs
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("no_entitlement");
  });

  it("allows soft persona in local_preview (provider none) only", () => {
    const allowed = evaluateAccess({
      subject: {
        kind: "soft_persona",
        personaId: "patron",
        tierIds: ["t_gold"]
      },
      resource: premiumPost(),
      provider: "none",
      nowMs
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.reason).toBe("soft_persona_preview");

    const denied = evaluateAccess({
      subject: {
        kind: "soft_persona",
        personaId: "public",
        tierIds: []
      },
      resource: premiumPost(),
      provider: "none",
      nowMs
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe("tier_insufficient");
  });

  it("denies soft persona for admin surfaces even in local_preview", () => {
    const result = evaluateAccess({
      subject: {
        kind: "soft_persona",
        personaId: "admin_looking",
        tierIds: ["t_gold"]
      },
      resource: { type: "admin_surface", siteId: SITE },
      provider: "none",
      nowMs
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("soft_persona_blocked");
  });

  it("denies unpublished posts for non-staff", () => {
    const result = evaluateAccess({
      subject: {
        kind: "member",
        userId: "u1",
        provider: "supabase",
        role: "patron",
        siteId: SITE
      },
      resource: premiumPost({ publishedAt: null }),
      grants: [activeGrant("patreon", ["t_gold"])],
      provider: "supabase",
      nowMs
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("unpublished_resource");
  });

  it("fails closed on invalid provider", () => {
    const result = evaluateAccess({
      subject: { kind: "anonymous" },
      resource: premiumPost(),
      provider: "invalid",
      nowMs
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("provider_invalid");
  });
});

describe("EH-032 freshness helpers", () => {
  it("computes default stale_after by source and warns on age", () => {
    const observed = "2026-07-22T00:00:00.000Z";
    const patreonStale = computeDefaultStaleAfter("patreon", observed);
    expect(patreonStale).toBe("2026-07-23T00:00:00.000Z");
    expect(computeDefaultStaleAfter("manual", observed)).toBeNull();

    const grant = activeGrant("patreon", ["t_gold"], {
      observedAt: "2020-01-01T00:00:00.000Z",
      staleAfter: "2099-01-01T00:00:00.000Z"
    });
    expect(isGrantStale(grant, Date.parse("2026-07-22T00:00:00.000Z"))).toBe(
      false
    );
    expect(
      shouldWarnFreshness(
        grant,
        Date.parse("2026-07-22T00:00:00.000Z"),
        DEFAULT_FRESHNESS_POLICY
      )
    ).toBe(true);
  });

  it("merges active grants and ignores cancelled sibling sources", () => {
    const merged = mergeEntitlementGrants(
      [
        activeGrant("patreon", ["t_silver"]),
        {
          source: "billing",
          tierIds: ["t_gold"],
          status: "revoked",
          observedAt: "2099-01-01T00:00:00.000Z",
          staleAfter: "2099-12-31T00:00:00.000Z",
          expiresAt: null,
          revokedAt: "2026-01-01T00:00:00.000Z",
          reason: "cancelled"
        },
        activeGrant("manual", ["t_bronze"])
      ],
      { nowMs: Date.parse("2026-07-22T12:00:00.000Z") }
    );
    expect(merged.effectiveTier).toEqual(
      expect.arrayContaining(["t_silver", "t_bronze"])
    );
    expect(merged.effectiveTier).not.toContain("t_gold");
    expect(merged.denyReason).toBeNull();
  });
});

describe("EH-032 SQL migrations (Path A / Path B)", () => {
  it("ships path-specific 0004 migrations without mixing auth.uid into Path B", () => {
    const supabase = readFileSync(
      join(TEMPLATE, "db/migrations/0004_entitlement_evaluator_supabase.sql"),
      "utf8"
    );
    const portable = readFileSync(
      join(TEMPLATE, "db/migrations/0004_entitlement_evaluator_portable.sql"),
      "utf8"
    );

    expect(existsSync(join(TEMPLATE, "lib/entitlements/evaluate.ts"))).toBe(
      true
    );
    expect(existsSync(join(TEMPLATE, "db/docker-init/03_entitlement_evaluator.sql"))).toBe(
      true
    );

    expect(supabase).toMatch(/auth\.uid\(\)/);
    expect(supabase).toMatch(/eh_private\.fresh_entitlement_tiers/);
    expect(supabase).toMatch(/eh_private\.entitled_for_access/);
    expect(supabase).toMatch(/eh_entitlement_grant_audit/);
    expect(supabase).toMatch(/expires_at/);
    expect(supabase).toMatch(/revoked_at/);
    expect(supabase).toMatch(/0004_entitlement_evaluator_supabase/);

    expect(portable).toMatch(/eh_private\.current_user_id\(\)/);
    expect(portable).not.toMatch(/auth\.uid\(\)/);
    expect(portable).not.toMatch(/REFERENCES auth\.users/);
    expect(portable).toMatch(/eh_private\.fresh_entitlement_tiers/);
    expect(portable).toMatch(/0004_entitlement_evaluator_portable/);

    const operations = readFileSync(join(TEMPLATE, "OPERATIONS.md"), "utf8");
    expect(operations).toMatch(/evaluateAccess/);
    expect(operations).toMatch(/stale_after/);
    expect(operations).toMatch(/fail-closed|Fail closed/i);
  });
});
