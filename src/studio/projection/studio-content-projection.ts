/**
 * Shared Studio content projection for chronological / collections / schedule lenses (RC-P2-T06).
 * Same post_ids; collections lens emits stacks for collections with ≥2 members.
 */
import type { Collection } from "../../gallery/types.js";

export const STUDIO_CONTENT_LENSES = ["chronological", "collections", "schedule"] as const;
export type StudioContentLens = (typeof STUDIO_CONTENT_LENSES)[number];

export type StudioProjectionPost = {
  post_id: string;
  title: string;
  published_at: string;
  collection_ids: string[];
};

export type StudioCollectionStack = {
  collection_id: string;
  title: string;
  post_ids: string[];
  member_titles: string[];
};

export type StudioScheduleSlice = {
  event_id: string;
  post_id: string | null;
  title: string;
  due_at: string;
  destination: string | null;
};

export type StudioContentProjection = {
  lens: StudioContentLens;
  post_ids: string[];
  chronological: StudioProjectionPost[];
  stacks: StudioCollectionStack[];
  schedule: StudioScheduleSlice[];
};

export function projectStudioContent(input: {
  lens: StudioContentLens;
  posts: StudioProjectionPost[];
  collections: Pick<Collection, "collection_id" | "title" | "post_ids">[];
  schedule: StudioScheduleSlice[];
}): StudioContentProjection {
  const chronological = [...input.posts].sort((a, b) => {
    if (a.published_at !== b.published_at) return a.published_at < b.published_at ? 1 : -1;
    return a.post_id.localeCompare(b.post_id);
  });
  const titleById = new Map(chronological.map((p) => [p.post_id, p.title]));
  const stacks: StudioCollectionStack[] = input.collections
    .filter((c) => c.post_ids.length >= 2)
    .map((c) => ({
      collection_id: c.collection_id,
      title: c.title,
      post_ids: [...c.post_ids],
      member_titles: c.post_ids.map((id) => titleById.get(id) ?? id)
    }));
  const postIds = [...new Set(chronological.map((p) => p.post_id))];
  return {
    lens: input.lens,
    post_ids: postIds,
    chronological,
    stacks,
    schedule: [...input.schedule]
  };
}

export function paginateProjectionPosts<T>(
  items: readonly T[],
  pageSize: number,
  pageIndex: number
): { page: T[]; has_more: boolean } {
  const size = Math.min(100, Math.max(1, pageSize));
  const start = pageIndex * size;
  const page = items.slice(start, start + size);
  return { page, has_more: start + size < items.length };
}
