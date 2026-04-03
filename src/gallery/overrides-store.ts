/**
 * Gallery post/media overrides: Relay-controlled layer that survives Patreon re-ingest.
 * Canonical ingest does not read or write this file. See docs/relay-artist-metadata.md.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { GalleryOverridesRoot, MediaOverride, PostVisibility } from "./types.js";

function compactMediaOverride(mo: MediaOverride): MediaOverride | null {
  const out: MediaOverride = {};
  if (mo.visibility !== undefined) {
    out.visibility = mo.visibility;
  }
  if (mo.add_tag_ids && mo.add_tag_ids.length > 0) {
    out.add_tag_ids = [...mo.add_tag_ids];
  }
  if (mo.remove_tag_ids && mo.remove_tag_ids.length > 0) {
    out.remove_tag_ids = [...mo.remove_tag_ids];
  }
  return Object.keys(out).length > 0 ? out : null;
}

function emptyRoot(): GalleryOverridesRoot {
  return { creators: {} };
}

/** Legacy JSON used `flagged`; normalize to `review` on read. */
function migrateLegacyVisibilityInPlace(root: GalleryOverridesRoot): void {
  for (const c of Object.values(root.creators)) {
    for (const po of Object.values(c.posts)) {
      if ((po.visibility as string | undefined) === "flagged") {
        po.visibility = "review";
      }
      if (po.media) {
        for (const mo of Object.values(po.media)) {
          if ((mo.visibility as string | undefined) === "flagged") {
            mo.visibility = "review";
          }
        }
      }
    }
  }
}

export class FileGalleryOverridesStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async load(): Promise<GalleryOverridesRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const root = JSON.parse(raw) as GalleryOverridesRoot;
      migrateLegacyVisibilityInPlace(root);
      return root;
    } catch {
      return emptyRoot();
    }
  }

  public async save(root: GalleryOverridesRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async mergePostTagDelta(
    creatorId: string,
    postId: string,
    delta: { add_tag_ids: string[]; remove_tag_ids: string[] }
  ): Promise<void> {
    const root = await this.load();
    if (!root.creators[creatorId]) {
      root.creators[creatorId] = { posts: {} };
    }
    const existing = root.creators[creatorId].posts[postId] ?? {
      add_tag_ids: [],
      remove_tag_ids: []
    };
    const addSet = new Set(existing.add_tag_ids);
    const remSet = new Set(existing.remove_tag_ids);
    for (const t of delta.add_tag_ids) {
      addSet.add(t);
      remSet.delete(t);
    }
    for (const t of delta.remove_tag_ids) {
      remSet.add(t);
      addSet.delete(t);
    }
    root.creators[creatorId].posts[postId] = {
      add_tag_ids: [...addSet],
      remove_tag_ids: [...remSet],
      ...(existing.visibility !== undefined ? { visibility: existing.visibility } : {}),
      ...(existing.media && Object.keys(existing.media).length > 0 ? { media: existing.media } : {})
    };
    await this.save(root);
  }

  /**
   * Merge tag add/remove for specific assets. Preserves per-asset visibility.
   * Skips `post_only_*` synthetic ids.
   */
  public async mergeBulkMediaTagDelta(
    creatorId: string,
    targets: { post_id: string; media_id: string }[],
    delta: { add_tag_ids: string[]; remove_tag_ids: string[] }
  ): Promise<void> {
    if (targets.length === 0) {
      return;
    }
    const root = await this.load();
    if (!root.creators[creatorId]) {
      root.creators[creatorId] = { posts: {} };
    }
    const seen = new Set<string>();
    for (const { post_id: postId, media_id: mediaId } of targets) {
      if (!mediaId || mediaId.startsWith("post_only_")) {
        continue;
      }
      const key = `${postId}\0${mediaId}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (!root.creators[creatorId].posts[postId]) {
        root.creators[creatorId].posts[postId] = { add_tag_ids: [], remove_tag_ids: [] };
      }
      const existing = root.creators[creatorId].posts[postId];
      const media = { ...(existing.media ?? {}) };
      const prev = media[mediaId] ?? {};
      const addSet = new Set(prev.add_tag_ids ?? []);
      const remSet = new Set(prev.remove_tag_ids ?? []);
      for (const t of delta.add_tag_ids) {
        addSet.add(t);
        remSet.delete(t);
      }
      for (const t of delta.remove_tag_ids) {
        remSet.add(t);
        addSet.delete(t);
      }
      const next: MediaOverride = {
        ...(prev.visibility !== undefined ? { visibility: prev.visibility } : {}),
        ...(addSet.size > 0 ? { add_tag_ids: [...addSet] } : {}),
        ...(remSet.size > 0 ? { remove_tag_ids: [...remSet] } : {})
      };
      const compact = compactMediaOverride(next);
      if (compact) {
        media[mediaId] = compact;
      } else {
        delete media[mediaId];
      }
      if (Object.keys(media).length === 0) {
        delete existing.media;
      } else {
        existing.media = media;
      }
      root.creators[creatorId].posts[postId] = existing;
    }
    await this.save(root);
  }

  public async setVisibility(
    creatorId: string,
    postIds: string[],
    visibility: PostVisibility
  ): Promise<void> {
    const root = await this.load();
    if (!root.creators[creatorId]) {
      root.creators[creatorId] = { posts: {} };
    }
    for (const postId of postIds) {
      const existing = root.creators[creatorId].posts[postId] ?? {
        add_tag_ids: [],
        remove_tag_ids: []
      };
      existing.visibility = visibility;
      root.creators[creatorId].posts[postId] = existing;
    }
    await this.save(root);
  }

  public async setMediaVisibility(
    creatorId: string,
    entries: { post_id: string; media_id: string; visibility: PostVisibility }[]
  ): Promise<void> {
    if (entries.length === 0) return;
    const root = await this.load();
    if (!root.creators[creatorId]) {
      root.creators[creatorId] = { posts: {} };
    }
    for (const { post_id: postId, media_id: mediaId, visibility } of entries) {
      const existing = root.creators[creatorId].posts[postId] ?? {
        add_tag_ids: [],
        remove_tag_ids: []
      };
      const media = { ...(existing.media ?? {}) };
      media[mediaId] = { ...(media[mediaId] ?? {}), visibility };
      existing.media = media;
      root.creators[creatorId].posts[postId] = existing;
    }
    await this.save(root);
  }
}
