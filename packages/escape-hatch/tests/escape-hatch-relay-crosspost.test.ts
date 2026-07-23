/**
 * EH-064 — Optional Relay Crosspost API (scoped tokens, ingest, audit).
 */

import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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
  loadSiteBundleFromKit,
  writeSiteBundleForKit
} from "../template/lib/cms/posts.js";
import { loadPatreonSyncState } from "../template/lib/patreon/sync-state.js";
import { ingestCrosspostPost } from "../template/lib/relay-crosspost/ingest.js";
import { loadCrosspostAudit } from "../template/lib/relay-crosspost/audit.js";
import {
  authenticateCrosspostBearer,
  mintCrosspostToken,
  revokeCrosspostToken
} from "../template/lib/relay-crosspost/tokens.js";
import { buildConnectionCards } from "../template/lib/admin/connections.js";

function minimalBundle(over?: Partial<SiteBundle>): SiteBundle {
  return parseSiteBundle({
    contract_version: SITE_BUNDLE_CONTRACT_VERSION,
    site_id: "site_eh_064",
    creator_id: "creator_eh_064",
    generated_at: "2026-07-23T20:00:00.000Z",
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
      }
    ],
    posts: [],
    total_media: 0,
    ...over
  });
}

describe("EH-064 status", () => {
  it("advances slice to EH-070 with next EH-071 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-070");
    expect(status.slice).toBe("EH-070");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-071");
    expect(status.nextSlice.title).toMatch(/docker|portable/i);
  });
});

describe("EH-064 Relay Crosspost", () => {
  it("mints hashed tokens, authenticates scopes, and revokes without wiping CMS", () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh064-tok-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      writeSiteBundleForKit(minimalBundle(), kitDir);

      const minted = mintCrosspostToken({
        siteId: "site_eh_064",
        scopes: ["crosspost:draft"],
        label: "Test",
        pepper: "pep",
        kitDir
      });
      expect(minted.ok).toBe(true);
      if (!minted.ok) return;

      const store = readFileSync(
        join(kitDir, "data", "relay-crosspost-tokens.json"),
        "utf8"
      );
      expect(store).not.toContain(minted.secret);
      expect(store).toContain(minted.record.prefix);

      const auth = authenticateCrosspostBearer(
        "site_eh_064",
        `Bearer ${minted.secret}`,
        { pepper: "pep", kitDir }
      );
      expect(auth.ok).toBe(true);

      const revoked = revokeCrosspostToken(
        "site_eh_064",
        minted.record.token_id,
        kitDir
      );
      expect(revoked.ok).toBe(true);

      const after = authenticateCrosspostBearer(
        "site_eh_064",
        `Bearer ${minted.secret}`,
        { pepper: "pep", kitDir }
      );
      expect(after.ok).toBe(false);

      const site = loadSiteBundleFromKit(kitDir);
      expect(site.posts).toHaveLength(0);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("ingests draft/publish with origin crossposted, audit, and idempotency", () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh064-in-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      writeSiteBundleForKit(minimalBundle(), kitDir);

      const draftTok = mintCrosspostToken({
        siteId: "site_eh_064",
        scopes: ["crosspost:draft"],
        kitDir
      });
      expect(draftTok.ok).toBe(true);
      if (!draftTok.ok) return;

      const authDraft = authenticateCrosspostBearer(
        "site_eh_064",
        `Bearer ${draftTok.secret}`,
        { kitDir }
      );
      expect(authDraft.ok).toBe(true);
      if (!authDraft.ok) return;

      const denied = ingestCrosspostPost({
        siteId: "site_eh_064",
        token: authDraft.token,
        action: "publish",
        title: "Should fail",
        upstream_id: "up_pub",
        kitDir
      });
      expect(denied.ok).toBe(false);
      expect(denied.status).toBe(403);

      const first = ingestCrosspostPost({
        siteId: "site_eh_064",
        token: authDraft.token,
        action: "draft",
        title: "Crosspost draft",
        body_plain: "Hello from Relay",
        upstream_id: "relay_post_1",
        idempotency_key: "idem-1",
        kitDir
      });
      expect(first.ok).toBe(true);
      expect(first.body.created).toBe(true);

      const second = ingestCrosspostPost({
        siteId: "site_eh_064",
        token: authDraft.token,
        action: "draft",
        title: "Different title ignored",
        upstream_id: "relay_post_1",
        idempotency_key: "idem-1",
        kitDir
      });
      expect(second.ok).toBe(true);
      expect(second.body).toEqual(first.body);

      const site = loadSiteBundleFromKit(kitDir);
      expect(site.posts).toHaveLength(1);
      expect(site.posts[0]?.status).toBe("draft");
      expect(site.posts[0]?.title).toBe("Crosspost draft");

      const sync = loadPatreonSyncState("site_eh_064", kitDir);
      const tracking = sync.posts[site.posts[0]!.post_id];
      expect(tracking?.origin).toBe("crossposted");
      expect(tracking?.upstream_id).toBe("relay_post_1");
      expect(tracking?.locally_edited).toBe(false);

      const audit = loadCrosspostAudit("site_eh_064", kitDir);
      expect(audit.entries.some((e) => e.ok && e.action === "draft")).toBe(
        true
      );
      expect(audit.idempotency.some((r) => r.key === "idem-1")).toBe(true);

      const pubTok = mintCrosspostToken({
        siteId: "site_eh_064",
        scopes: ["crosspost:publish"],
        kitDir
      });
      expect(pubTok.ok).toBe(true);
      if (!pubTok.ok) return;
      const authPub = authenticateCrosspostBearer(
        "site_eh_064",
        `Bearer ${pubTok.secret}`,
        { kitDir }
      );
      expect(authPub.ok).toBe(true);
      if (!authPub.ok) return;

      const published = ingestCrosspostPost({
        siteId: "site_eh_064",
        token: authPub.token,
        action: "publish",
        title: "Crosspost live",
        upstream_id: "relay_post_2",
        kitDir
      });
      expect(published.ok).toBe(true);
      const after = loadSiteBundleFromKit(kitDir);
      expect(after.posts).toHaveLength(2);
      expect(
        after.posts.find((p) => p.title === "Crosspost live")?.status
      ).toBe("published");
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("adds a Crosspost card on connections without claiming productionSafe", () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh064-conn-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      const cards = buildConnectionCards(
        [
          {
            id: "billing",
            implementation: "stub",
            ok: false,
            detail: "Billing stub"
          }
        ],
        { siteId: "site_eh_064", kitDir }
      );
      expect(cards.some((c) => c.id === "crosspost")).toBe(true);
      const xp = cards.find((c) => c.id === "crosspost")!;
      expect(xp.deep_link).toBe("/admin/crosspost");
      expect(xp.next_action).toMatch(/productionSafe|crosspost/i);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });
});
