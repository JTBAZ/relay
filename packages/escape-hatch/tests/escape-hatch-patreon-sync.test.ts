/**
 * EH-063 — Optional Patreon transition sync (read-only, conflict queue).
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
import { upsertPost, writeSiteBundleForKit } from "../template/lib/cms/posts.js";
import {
  loadPatreonSyncState,
  savePatreonSyncState
} from "../template/lib/patreon/sync-state.js";
import {
  mapPatreonPostsPage,
  runPatreonTransitionSync
} from "../template/lib/patreon/sync.js";

function minimalBundle(over?: Partial<SiteBundle>): SiteBundle {
  return parseSiteBundle({
    contract_version: SITE_BUNDLE_CONTRACT_VERSION,
    site_id: "site_eh_063",
    creator_id: "creator_eh_063",
    generated_at: "2026-07-23T18:00:00.000Z",
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

describe("EH-063 status", () => {
  it("advances slice to EH-064 with next EH-070 and productionSafe false", () => {
    const status = buildEscapeHatchStatus();
    expect(ESCAPE_HATCH_SLICE).toBe("EH-064");
    expect(status.slice).toBe("EH-064");
    expect(status.productionSafe).toBe(false);
    expect(status.nextSlice.id).toBe("EH-070");
    expect(status.nextSlice.title).toMatch(/vercel|deploy/i);
  });
});

describe("EH-063 Patreon sync", () => {
  it("maps Patreon JSON:API pages and imports unprotected posts", async () => {
    const mapped = mapPatreonPostsPage({
      data: [
        {
          id: "up_1",
          attributes: {
            title: "From Patreon",
            published_at: "2026-06-01T00:00:00.000Z",
            edited_at: "rev_a",
            is_public: false,
            tier_ids: ["tier_basic"],
            teaser_text: "Hello"
          }
        }
      ]
    });
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.upstream_id).toBe("up_1");

    const kitDir = mkdtempSync(join(tmpdir(), "eh063-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      writeSiteBundleForKit(minimalBundle(), kitDir);

      const first = await runPatreonTransitionSync({
        siteId: "site_eh_063",
        campaignId: "camp",
        kitDir,
        fetchPosts: async () => mapped
      });
      expect(first.ok).toBe(true);
      expect(first.created).toBe(1);

      const second = await runPatreonTransitionSync({
        siteId: "site_eh_063",
        campaignId: "camp",
        kitDir,
        fetchPosts: async () => mapped
      });
      expect(second.ok).toBe(true);
      expect(second.unchanged).toBe(1);
      expect(second.created).toBe(0);
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("queues a conflict when a locally edited post has a new upstream revision", async () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh063c-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      writeSiteBundleForKit(minimalBundle(), kitDir);

      await runPatreonTransitionSync({
        siteId: "site_eh_063",
        campaignId: "camp",
        kitDir,
        fetchPosts: async () => [
          {
            upstream_id: "up_edit",
            upstream_revision: "rev_1",
            title: "Editable",
            published_at: "2026-06-01T00:00:00.000Z",
            access_level: "public",
            tier_ids: []
          }
        ]
      });

      const stateAfterImport = loadPatreonSyncState("site_eh_063", kitDir);
      const postId = Object.keys(stateAfterImport.posts)[0]!;
      expect(postId).toBeTruthy();

      const edited = upsertPost(
        {
          post_id: postId,
          title: "Locally changed title",
          access_level: "public",
          status: "published"
        },
        kitDir
      );
      expect(edited.ok).toBe(true);
      const tracked = loadPatreonSyncState("site_eh_063", kitDir).posts[postId];
      expect(tracked?.locally_edited).toBe(true);

      const conflicted = await runPatreonTransitionSync({
        siteId: "site_eh_063",
        campaignId: "camp",
        kitDir,
        fetchPosts: async () => [
          {
            upstream_id: "up_edit",
            upstream_revision: "rev_2",
            title: "Upstream title",
            published_at: "2026-06-01T00:00:00.000Z",
            access_level: "public",
            tier_ids: []
          }
        ]
      });
      expect(conflicted.ok).toBe(true);
      expect(conflicted.conflicts).toBeGreaterThan(0);
      expect(
        conflicted.conflict_queue.some((c) => c.kind === "local_edit")
      ).toBe(true);

      const site = parseSiteBundle(
        JSON.parse(readFileSync(join(kitDir, "data", "site.json"), "utf8"))
      );
      const local = site.posts.find((p) => p.post_id === postId);
      expect(local?.title).toBe("Locally changed title");
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });

  it("protects native posts from sync overwrite", async () => {
    const kitDir = mkdtempSync(join(tmpdir(), "eh063n-"));
    try {
      mkdirSync(join(kitDir, "data"), { recursive: true });
      writeSiteBundleForKit(minimalBundle(), kitDir);
      const created = upsertPost(
        {
          title: "Native only",
          access_level: "public",
          status: "published"
        },
        kitDir
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const state = loadPatreonSyncState("site_eh_063", kitDir);
      state.posts[created.post.post_id] = {
        origin: "native",
        locally_edited: false,
        upstream_id: "up_native_collide",
        upstream_revision: null
      };
      savePatreonSyncState(state, kitDir);

      const result = await runPatreonTransitionSync({
        siteId: "site_eh_063",
        campaignId: "camp",
        kitDir,
        fetchPosts: async () => [
          {
            upstream_id: "up_native_collide",
            upstream_revision: "rev_x",
            title: "Should not win",
            published_at: "2026-06-01T00:00:00.000Z",
            access_level: "public",
            tier_ids: []
          }
        ]
      });
      expect(result.conflicts).toBeGreaterThan(0);
      expect(result.conflict_queue.some((c) => c.kind === "native_post")).toBe(
        true
      );
    } finally {
      rmSync(kitDir, { recursive: true, force: true });
    }
  });
});
