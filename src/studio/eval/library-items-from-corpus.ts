/**
 * Map the Lab 2 JSON corpus onto CommandLibraryItem rows (RC-P3-T04).
 * Used by facade-only eval so search/sequence run without Prisma.
 */
import type { StudioLab2Corpus } from "../lab2/corpus-spec.js";
import type { CommandLibraryItem } from "../command/selection.js";

export function commandLibraryItemsFromLab2Corpus(
  corpus: StudioLab2Corpus
): CommandLibraryItem[] {
  const distByPost = new Map<string, StudioLab2Corpus["distribution"]>();
  for (const row of corpus.distribution ?? []) {
    const arr = distByPost.get(row.post_id) ?? [];
    arr.push(row);
    distByPost.set(row.post_id, arr);
  }

  const items: CommandLibraryItem[] = [];
  for (const post of corpus.posts) {
    const dests = distByPost.get(post.post_id) ?? [];
    const distribution_summary =
      dests.length > 0
        ? {
            post_id: post.post_id,
            destinations: dests.map((d) => ({
              destination: d.destination,
              variant_status: null,
              attempt_status: d.attempt_status,
              attempt_id: null,
              external_url: d.external_url,
              external_id: d.external_id
            }))
          }
        : undefined;
    const mediaRows = post.media.length > 0 ? post.media : [undefined];
    for (const media of mediaRows) {
      items.push({
        media_id: media?.media_id ?? `post_only_${post.post_id}`,
        post_id: post.post_id,
        title: post.title,
        description: post.description,
        published_at: post.published_at,
        tag_ids: [...post.tag_ids],
        tier_ids: [...post.tier_ids],
        is_public: post.is_public,
        mime_type: media?.mime_type,
        media_role: media?.role,
        has_export: true,
        processing_status: "READY",
        export_status: "ready",
        content_url_path: "",
        preview_url_path: "",
        thumb_url_path: "",
        visibility: post.is_public ? "visible" : "review",
        collection_ids: [],
        collection_theme_tag_ids: [],
        source: post.source,
        member_label: post.title,
        distribution_summary
      });
    }
  }
  return items;
}
