import { describe, expect, it } from "vitest";
import type { CanonicalSnapshot } from "../src/ingest/canonical-store.js";
import {
  creatorIdentityForCollectionEntry,
  hydratePatronCollectionDetailEntries,
  resolveMediaPositionInPost,
  toPatronOwnerCollectionDetail,
} from "../src/patron/patron-collection-detail-service.js";

function makeSnapshot(): CanonicalSnapshot {
  return {
    ingest_idempotency: {},
    campaigns: {},
    tiers: {},
    posts: {
      c1: {
        p1: {
          post_id: "p1",
          creator_id: "c1",
          current: {
            version_seq: 1,
            upstream_revision: "v1",
            title: "Batch",
            description: "A source post description for this saved media.",
            published_at: "2026-03-10T12:00:00Z",
            tag_ids: [],
            tier_ids: [],
            media_ids: ["m_1", "m_2"],
            ingested_at: "2026-03-10T12:00:00Z",
          },
          versions: [],
          upstream_status: "active",
        },
      },
    },
    media: {
      c1: {
        m_1: {
          media_id: "m_1",
          creator_id: "c1",
          post_ids: ["p1"],
          upstream_status: "active",
          current: {
            version_seq: 1,
            upstream_revision: "a",
            mime_type: "image/png",
            ingested_at: "2026-03-10T12:00:00Z",
          },
          versions: [],
        },
        m_2: {
          media_id: "m_2",
          creator_id: "c1",
          post_ids: ["p1"],
          upstream_status: "active",
          current: {
            version_seq: 1,
            upstream_revision: "b",
            mime_type: "video/mp4",
            ingested_at: "2026-03-10T12:00:00Z",
          },
          versions: [],
        },
      },
    },
  };
}

describe("patron-collection-detail-service", () => {
  it("resolveMediaPositionInPost returns 1-based index and total count", () => {
    expect(resolveMediaPositionInPost(["m_1", "m_2", "m_3"], "m_2")).toEqual({
      source_media_index: 2,
      source_media_count: 3,
    });
    expect(resolveMediaPositionInPost(["m_1"], "m_1")).toEqual({
      source_media_index: 1,
      source_media_count: 1,
    });
    expect(resolveMediaPositionInPost(undefined, "m_1")).toBeNull();
  });

  it("creatorIdentityForCollectionEntry prefers profile fields", () => {
    expect(
      creatorIdentityForCollectionEntry("rc_long_creator_id", {
        username: "ava",
        displayName: "Ava Studio",
        avatarUrl: "/avatars/ava.png",
      })
    ).toEqual({
      handle: "ava",
      displayName: "Ava Studio",
      avatarUrl: "/avatars/ava.png",
    });
  });

  it("hydrates visible image entries with thumb_url_path and post title", () => {
    const snapshot = makeSnapshot();
    const entries = hydratePatronCollectionDetailEntries(snapshot, [
      {
        entry_id: "e1",
        collection_id: "col1",
        user_id: "u1",
        creator_id: "c1",
        post_id: "p1",
        media_id: "m_1",
        created_at: "2026-03-10T12:00:00Z",
        viewer_entitlement: {
          state: "visible",
          required_tier_ids: [],
          source: "free_post",
        },
      },
    ], new Map([
      [
        "c1",
        {
          username: "ava",
          displayName: "Ava Studio",
          avatarUrl: "/avatars/ava.png",
        },
      ],
    ]));

    expect(entries[0]).toMatchObject({
      source_post_title: "Batch",
      source_post_description: "A source post description for this saved media.",
      mime_type: "image/png",
      thumb_url_path: "/api/v1/export/media/c1/m_1/thumb",
      content_url_path: "/api/v1/export/media/c1/m_1/content",
      source_media_index: 1,
      source_media_count: 2,
      creator_handle: "ava",
      creator_display_name: "Ava Studio",
      creator_avatar_url: "/avatars/ava.png",
    });
  });

  it("suppresses thumb_url_path for locked entries", () => {
    const snapshot = makeSnapshot();
    const entries = hydratePatronCollectionDetailEntries(snapshot, [
      {
        entry_id: "e1",
        collection_id: "col1",
        user_id: "u1",
        creator_id: "c1",
        post_id: "p1",
        media_id: "m_1",
        created_at: "2026-03-10T12:00:00Z",
        viewer_entitlement: {
          state: "locked",
          required_tier_ids: ["tier_gold"],
          source: "missing_snapshot",
        },
      },
    ]);

    expect(entries[0]).toMatchObject({
      mime_type: "image/png",
      source_post_title: "Batch",
    });
    expect(entries[0].thumb_url_path).toBeUndefined();
    expect(entries[0].content_url_path).toBeUndefined();
  });

  it("omits thumb for non-image media even when visible", () => {
    const snapshot = makeSnapshot();
    const entries = hydratePatronCollectionDetailEntries(snapshot, [
      {
        entry_id: "e2",
        collection_id: "col1",
        user_id: "u1",
        creator_id: "c1",
        post_id: "p1",
        media_id: "m_2",
        created_at: "2026-03-10T12:00:00Z",
        viewer_entitlement: {
          state: "visible",
          required_tier_ids: [],
          source: "free_post",
        },
      },
    ]);

    expect(entries[0].mime_type).toBe("video/mp4");
    expect(entries[0].thumb_url_path).toBeUndefined();
    expect(entries[0].content_url_path).toBe("/api/v1/export/media/c1/m_2/content");
  });

  it("toPatronOwnerCollectionDetail preserves collection metadata", () => {
    const detail = toPatronOwnerCollectionDetail(
      {
        collection_id: "col1",
        user_id: "u1",
        creator_id: "c1",
        title: "Shelf",
        sort_order: 0,
        created_at: "2026-03-10T12:00:00Z",
        updated_at: "2026-03-10T12:00:00Z",
        is_public: true,
        entries: [],
      },
      []
    );

    expect(detail).toMatchObject({
      collection_id: "col1",
      title: "Shelf",
      entry_count: 0,
      is_public: true,
    });
  });
});
