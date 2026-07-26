/**
 * Slice 0 Batch 2 — characterize honest write paths and freeze mock/inert deletion targets.
 * @see docs/studio/AUDIENCE_PROMOTION_CONVERSION.md
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildGalleryVisibilityBody,
  nextVisibilityAfterAxisAction,
  bucketItemsByVisibilityAfterAction,
  type GalleryItem,
} from "../../web/lib/relay-api";
import {
  formatAudienceAccessConfirmCopy,
  gateFromAccessTiers,
  gateFromComposeSelection,
  LIBRARY_CREATE_POST_PUBLIC_TIER,
  diffAudienceAccessTiers
} from "../../web/lib/audience-access-tier-diff";
import type { RelayComposeTierRow, TierFacet } from "../../web/lib/relay-api";
import {
  buildPreviewizerSession,
  type PreviewizerMode,
  type PreviewizerResult,
  type PreviewizerUploadPreview
} from "../../web/lib/previewizer-session";
import {
  parseAudiencePersonaKey,
  tierPersonaKey,
  type AudiencePersonaKey,
  type PreviewTreatment
} from "../../web/lib/audience-promotion-contracts";

const ROOT = join(__dirname, "../..");

const STUDIO_RUNTIME_DIRS = [
  join(ROOT, "web/app"),
  join(ROOT, "web/lib")
] as const;

function studioRuntimeSourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(full);
        continue;
      }
      if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(full);
    }
  };
  for (const dir of STUDIO_RUNTIME_DIRS) walk(dir);
  return files;
}

function studioRuntimeSource(): string {
  return studioRuntimeSourceFiles()
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

function galleryItem(
  overrides: Partial<GalleryItem> & Pick<GalleryItem, "media_id" | "post_id">
): GalleryItem {
  return {
    title: "t",
    description: "",
    published_at: "2026-01-01T00:00:00.000Z",
    tag_ids: [],
    tier_ids: ["patreon_tier_supporter"],
    has_export: true,
    processing_status: "READY",
    export_status: "ready",
    content_url_path: "/x",
    preview_url_path: "/p",
    thumb_url_path: "/th",
    visibility: "visible",
    collection_ids: [],
    collection_theme_tag_ids: [],
    ...overrides
  };
}

const catalog: RelayComposeTierRow[] = [
  {
    tier_id: "prisma_supporter",
    relay_tier_id: "patreon_tier_supporter",
    title: "Supporter",
    amount_cents: 500
  },
  {
    tier_id: "prisma_studio",
    relay_tier_id: "patreon_tier_studio",
    title: "Studio",
    amount_cents: 2500
  }
];

describe("Slice 0 — visibility axis (Layer C)", () => {
  it("buildGalleryVisibilityBody has visibility + creator/post/media targets and no tier_ids", () => {
    const items = [
      galleryItem({ media_id: "m1", post_id: "p1" }),
      galleryItem({ media_id: "post_only_p1", post_id: "p1" }),
      galleryItem({ media_id: "m2", post_id: "p1" })
    ];
    const body = buildGalleryVisibilityBody("cr1", items, "hidden");
    expect(body).toEqual({
      creator_id: "cr1",
      post_ids: ["p1"],
      media_targets: [
        { post_id: "p1", media_id: "m1" },
        { post_id: "p1", media_id: "m2" }
      ],
      visibility: "hidden"
    });
    expect(body).not.toHaveProperty("tier_ids");
    expect(JSON.stringify(body)).not.toContain("tier");
  });

  it("axis helpers: hidden blocks mature→visible; set_hidden clears presence", () => {
    expect(nextVisibilityAfterAxisAction("visible", "set_hidden")).toBe("hidden");
    expect(nextVisibilityAfterAxisAction("review", "set_hidden")).toBe("hidden");
    expect(nextVisibilityAfterAxisAction("hidden", "set_mature")).toBe("hidden");
    expect(nextVisibilityAfterAxisAction("hidden", "set_general")).toBe("hidden");
    expect(nextVisibilityAfterAxisAction("visible", "set_mature")).toBe("review");
    expect(nextVisibilityAfterAxisAction("review", "set_general")).toBe("visible");
    expect(nextVisibilityAfterAxisAction("hidden", "set_visible")).toBe("visible");
  });

  it("bucketItemsByVisibilityAfterAction groups by next visibility without mutating tier_ids", () => {
    const items = [
      galleryItem({ media_id: "a", post_id: "p", visibility: "visible", tier_ids: ["patreon_tier_supporter"] }),
      galleryItem({ media_id: "b", post_id: "p", visibility: "review", tier_ids: ["patreon_tier_studio"] })
    ];
    const buckets = bucketItemsByVisibilityAfterAction(items, "set_hidden");
    const hidden = buckets.get("hidden") ?? [];
    expect(hidden).toHaveLength(2);
    // Original item visibility fields unchanged; bucket key is the next state
    expect(items[0]!.visibility).toBe("visible");
    expect(items[1]!.visibility).toBe("review");
    expect(items[0]!.tier_ids).toEqual(["patreon_tier_supporter"]);
    expect(items[1]!.tier_ids).toEqual(["patreon_tier_studio"]);
    const body = buildGalleryVisibilityBody("cr1", items, "hidden");
    expect(Object.keys(body).sort()).toEqual([
      "creator_id",
      "media_targets",
      "post_ids",
      "visibility"
    ]);
  });
});

describe("Slice 0 — audience access (Layer A)", () => {
  it("gateFromComposeSelection collapses multi-select to a single relay tier id", () => {
    const multiUpstream: TierFacet[] = [
      { tier_id: "patreon_tier_supporter", title: "Supporter" },
      { tier_id: "patreon_tier_studio", title: "Studio" }
    ];
    const upstream = gateFromAccessTiers(multiUpstream);
    expect(upstream.isPublic).toBe(false);
    expect(upstream.relayTierIds).toEqual([
      "patreon_tier_supporter",
      "patreon_tier_studio"
    ]);

    const afterSave = gateFromComposeSelection("prisma_supporter", catalog);
    expect(afterSave).toEqual({
      isPublic: false,
      relayTierIds: ["patreon_tier_supporter"]
    });
    expect(afterSave.relayTierIds).toHaveLength(1);
  });

  it("formatAudienceAccessConfirmCopy documents multi-tier collapse", () => {
    const copy = formatAudienceAccessConfirmCopy(
      { losing: ["Studio"], gaining: [] },
      { multiTierCollapse: true }
    );
    expect(copy.multiTierNote).toContain("single tier gate");
  });

  it("public sentinel clears tier gate", () => {
    expect(gateFromComposeSelection(LIBRARY_CREATE_POST_PUBLIC_TIER, catalog)).toEqual({
      isPublic: true,
      relayTierIds: []
    });
  });

  it("diffAudienceAccessTiers still runs after multi-tier upstream", () => {
    const oldAccess: TierFacet[] = [
      { tier_id: "patreon_tier_supporter", title: "Supporter" },
      { tier_id: "patreon_tier_studio", title: "Studio" }
    ];
    const diff = diffAudienceAccessTiers(oldAccess, "prisma_studio", catalog);
    expect(diff.losing.length + diff.gaining.length).toBeGreaterThan(0);
  });
});

describe("Slice 0 — presentation + Previewizer adapter boundary", () => {
  it("contracts allow TierPreviewSettingsV1-shaped JSON without fallback persona labels", () => {
    const treatment: PreviewTreatment = "partial-unblur";
    const key: AudiencePersonaKey = tierPersonaKey("patreon_tier_supporter");
    expect(parseAudiencePersonaKey(key)).toBe(key);
    expect(parseAudiencePersonaKey("anonymous")).toBe("anonymous");
    expect(parseAudiencePersonaKey("basic")).toBeNull();
    expect(parseAudiencePersonaKey("Goku Rank")).toBeNull();
    const settings = {
      schema_version: 1 as const,
      personas: {
        [key]: { preview_style: treatment, cta_text: "Unlock this post" }
      }
    };
    expect(JSON.stringify(settings)).not.toMatch(/Goku|Basic|Advanced/i);
  });

  it("PreviewizerMode is standalone or distribution; result is mediaId-only", () => {
    const modes: PreviewizerMode[] = ["standalone", "distribution"];
    expect(modes).toEqual(["standalone", "distribution"]);
    const result: PreviewizerResult = { previewMediaId: "m_preview" };
    expect(Object.keys(result)).toEqual(["previewMediaId"]);
  });

  it("buildPreviewizerSession stays domain-neutral (no Relay routing fields)", () => {
    const session = buildPreviewizerSession({
      creatorId: "cr1",
      postId: "p1",
      sourceMediaId: "m1",
      sourceImageUrl: "http://127.0.0.1:8787/api/v1/export/media/cr1/m1/content"
    });
    expect(session).not.toHaveProperty("destinations");
    expect(session).not.toHaveProperty("upload");
  });

  it("PreviewizerUploadPreview is an injected adapter type (host-owned)", () => {
    const adapter: PreviewizerUploadPreview = async () => ({ mediaId: "x" });
    expect(typeof adapter).toBe("function");
  });

  it("previewizer package sources do not import relay-api or staging upload", () => {
    const dir = join(ROOT, "web/app/components/previewizer");
    const samples = [
      "previewizer-client.tsx",
      "index.ts",
      "previewizer-export-modal.tsx"
    ];
    for (const file of samples) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src).not.toMatch(/from ["']@\/lib\/relay-api/);
      expect(src).not.toMatch(/relay-native-staging-upload/);
    }
  });
});

describe("Slice 0 — legacy deletion targets removed (G9)", () => {
  const deletedShells = [
    "web/app/components/InspectModal.tsx",
    "web/app/components/PostBatchModal.tsx",
    "web/app/components/PostBatchPostDetails.tsx",
    "web/app/components/inspect/post-audience-preview.tsx",
    "web/app/components/inspect/inspect-meta-sidebar.tsx",
    "web/app/components/inspect/inspect-smart-tag-panel.tsx",
    "web/app/components/inspect/inspect-audience-access-editor.tsx",
    "web/app/components/inspect/post-reach-panel.tsx"
  ];

  it("legacy Inspect/PostBatch shells and inspect-only orphans are deleted", () => {
    for (const rel of deletedShells) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(false);
    }
  });

  it("studio runtime has zero imports of InspectModal or PostBatchModal", () => {
    const src = studioRuntimeSource();
    expect(src).not.toMatch(/from ["']@\/app\/components\/InspectModal/);
    expect(src).not.toMatch(/from ["']@\/app\/components\/PostBatchModal/);
    expect(src).not.toMatch(/from ["']\.\/InspectModal/);
    expect(src).not.toMatch(/from ["']\.\/PostBatchModal/);
  });

  it("studio runtime has no FALLBACK_AUDIENCES mock personas", () => {
    const src = studioRuntimeSource();
    expect(src).not.toMatch(/\bFALLBACK_AUDIENCES\b\s*[:=]/);
    expect(src).not.toMatch(/from ["'].*post-audience-preview/);
  });

  it("audience-promotion contracts reject fallback persona labels", () => {
    expect(parseAudiencePersonaKey("free")).toBeNull();
    expect(parseAudiencePersonaKey("goku")).toBeNull();
    expect(parseAudiencePersonaKey("tier:")).toBeNull();
  });
});
