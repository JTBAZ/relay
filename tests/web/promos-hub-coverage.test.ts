/**
 * VS6-T01 — Acceptance → evidence map for Studio Promos slices.
 * Behavioral coverage lives in the linked suites; this file asserts the map stays complete.
 */
import { describe, expect, it } from "vitest";

const COVERAGE: Array<{ id: string; acceptance: string; evidence: string }> = [
  {
    id: "VS1-empty-add",
    acceptance: "Empty pool + Add Post under dashed window + Make Promos",
    evidence: "tests/web/promos-hub-pieces.test.tsx"
  },
  {
    id: "IA-pool-hero",
    acceptance: "Promo Pool is hub hero; Performance is secondary; no Relay strategy card",
    evidence: "tests/web/promos-hub-pieces.test.tsx + tests/web/promos-hub-performance.test.tsx"
  },
  {
    id: "VS1-linked-set",
    acceptance: "Linked Set members selectable as separate posts; max 5",
    evidence: "tests/web/promo-post-picker-model.test.ts + promos-hub-pieces.test.tsx"
  },
  {
    id: "VS1-persist-put",
    acceptance: "Full-set PUT with target_kind post and compact ranks",
    evidence: "tests/web/promos-hub-pieces.test.tsx + tests/creator-promo-slots.test.ts"
  },
  {
    id: "VS2-identity",
    acceptance: "promo_piece_id stable across reorder; duplicate target rejected",
    evidence: "tests/creator-promo-slots.test.ts"
  },
  {
    id: "VS2-owner-markers",
    acceptance: "Owner markers never on visitor DTOs",
    evidence: "tests/creator-promo-piece-markers.test.ts"
  },
  {
    id: "VS3-inheritance",
    acceptance: "inherited_piece_count from real gate matching",
    evidence: "tests/marketing/promotion-hub-summary.test.ts + promos-hub-tier-rules.test.tsx"
  },
  {
    id: "VS3-tracked-link",
    acceptance: "Tier default mint/copy/QR; missing destination not ready",
    evidence: "tests/web/promos-hub-tier-rules.test.tsx + tests/offer-redirect-service.test.ts"
  },
  {
    id: "VS4-codes-hub",
    acceptance: "Controlled codes + draft-preserving Add code return + usage counts",
    evidence: "tests/web/promos-hub-codes.test.tsx + promotion-hub-summary.test.ts"
  },
  {
    id: "VS5-preview",
    acceptance: "Exact piece selection; effective_promo pass-through; unavailable metrics",
    evidence: "tests/web/promos-hub-preview.test.tsx"
  },
  {
    id: "VS5-precedence",
    acceptance: "explicit over tier_default; entitled no promo",
    evidence: "tests/marketing/effective-marketing-offer.test.ts + promos-hub-preview.test.tsx"
  },
  {
    id: "VS6-browser-creator",
    acceptance: "Empty→modal→save→rules→codes→preview visual path",
    evidence: "browser: VS6-T04 (manual/agent browser)"
  },
  {
    id: "VS6-browser-patron",
    acceptance: "Locked overlay parity; no owner markers in patron network",
    evidence: "browser: VS6-T05 + tests/creator-promo-piece-markers.test.ts + patron feed tests"
  }
];

describe("VS6 promo acceptance coverage map", () => {
  it("maps every shipped acceptance to automated or explicit browser evidence", () => {
    expect(COVERAGE.length).toBeGreaterThanOrEqual(10);
    for (const row of COVERAGE) {
      expect(row.evidence.trim().length).toBeGreaterThan(0);
      expect(row.acceptance.trim().length).toBeGreaterThan(0);
    }
    const browserOnly = COVERAGE.filter((r) => r.evidence.startsWith("browser:"));
    expect(browserOnly.every((r) => /VS6-T0[45]/.test(r.evidence))).toBe(true);
  });
});
