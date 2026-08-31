import { describe, expect, it } from "vitest";
import {
  buildCommandPlannerContext,
  plannerPayloadContainsSecrets
} from "../../../src/studio/command/command-planner-context.js";
import type { CommandLibraryItem } from "../../../src/studio/command/selection.js";
import type { GalleryItem } from "../../../src/gallery/types.js";

function item(overrides: Partial<CommandLibraryItem> = {}): CommandLibraryItem {
  const base: GalleryItem = {
    media_id: overrides.media_id ?? "media_1",
    post_id: overrides.post_id ?? "post_1",
    title: overrides.title ?? "Standalone study",
    published_at: overrides.published_at ?? "2026-03-01T00:00:00.000Z",
    tag_ids: overrides.tag_ids ?? [],
    tier_ids: [],
    has_export: true,
    processing_status: "READY",
    export_status: "ready",
    content_url_path: overrides.content_url_path ?? "https://cdn.example/secret.png",
    preview_url_path: overrides.preview_url_path ?? "https://cdn.example/preview.jpg",
    thumb_url_path: overrides.thumb_url_path ?? "/api/v1/media/abc/thumb",
    visibility: overrides.visibility ?? "visible",
    collection_ids: overrides.collection_ids ?? ["sl2_col_photo_studies"],
    collection_theme_tag_ids: [],
    distribution_summary: overrides.distribution_summary
  };
  return { ...base, source: "PATREON", ...overrides };
}

describe("Command planner compact context (RC-P7-T03)", () => {
  it("catalogs tags, titles, destinations, and collection titles without media or PII", () => {
    const context = buildCommandPlannerContext({
      items: [
        item({
          title: "River morning",
          tag_ids: ["sl2_tag_watercolor", "sl2_tag_landscape"],
          collection_ids: ["sl2_col_photo_studies"]
        }),
        item({
          post_id: "post_2",
          title: "contact me at artist@example.com",
          tag_ids: ["sl2_tag_watercolor"]
        })
      ],
      collections: [{ collection_id: "sl2_col_photo_studies", title: "Photo Studies" }],
      proposal: {
        proposal_id: "pr_ctx",
        creator_id: "cr_ctx",
        stage: "plan_shaping",
        instruction: "weekly drops",
        snapshot: {
          post_ids: ["post_1"],
          explanation: "schedule",
          warnings: [],
          match_evidence: [],
          revision: "rev",
          complete: true,
          creator_id: "cr_ctx",
          created_at: "2026-08-30T00:00:00.000Z"
        },
        records: [],
        exclude_post_ids: [],
        frozen_post_ids: ["post_1"],
        frozen_revision: "frozen",
        created_at: "2026-08-30T00:00:00.000Z",
        updated_at: "2026-08-30T00:00:00.000Z",
        plan: {
          version: 1,
          time_zone: "UTC",
          weekday: 4,
          interval_days: 7,
          start_local: "2026-09-03T19:00:00",
          exclude_post_ids: [],
          skip_post_ids: [],
          slot_overrides: {}
        }
      }
    });
    expect(context.proposal?.plan).toEqual({
      weekday: 4,
      interval_days: 7,
      start_local: "2026-09-03T19:00:00"
    });
    expect(context.tags.map((row) => row.label).sort()).toEqual(["landscape", "watercolor"]);
    expect(context.collection_titles).toEqual([
      { collection_id: "sl2_col_photo_studies", title: "Photo Studies" }
    ]);
    expect(context.title_vocabulary).toEqual(["River morning"]);
    expect(context.destinations).toEqual(expect.arrayContaining(["x", "patreon"]));
    expect(plannerPayloadContainsSecrets(context)).toBe(false);
    expect(JSON.stringify(context)).not.toMatch(/content_url_path|thumb_url_path|preview_url_path/);
  });
});
