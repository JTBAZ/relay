import {
  fetchGalleryPostDetail,
  galleryItemImageGridSrc,
  galleryItemVideoPosterSrc,
  type GalleryItem
} from "@/lib/relay-api";
import { LAB3_ARTWORK_FETCH_LIMIT } from "@/app/components/studio-lab3/lab3-constants";

export function artworkSrcFromGalleryItems(
  items: GalleryItem[],
  postId: string
): string | null {
  const match = items.find((it) => it.post_id === postId);
  if (!match) return null;
  return galleryItemImageGridSrc(match) ?? galleryItemVideoPosterSrc(match);
}

export function galleryArtworkMap(items: GalleryItem[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const it of items) {
    if (map.has(it.post_id)) continue;
    map.set(it.post_id, galleryItemImageGridSrc(it) ?? galleryItemVideoPosterSrc(it));
  }
  return map;
}

export async function resolveMissingLab3Artwork(opts: {
  creatorId: string;
  postIds: string[];
  known: Map<string, string | null>;
  fetchDetail?: typeof fetchGalleryPostDetail;
  limit?: number;
}): Promise<Map<string, string | null>> {
  const {
    creatorId,
    postIds,
    known,
    fetchDetail = fetchGalleryPostDetail,
    limit = LAB3_ARTWORK_FETCH_LIMIT
  } = opts;
  const next = new Map(known);
  const missing = [...new Set(postIds.filter((id) => id.trim()))].filter((id) => !next.has(id));
  const bounded = missing.slice(0, limit);
  await Promise.all(
    bounded.map(async (id) => {
      try {
        const detail = await fetchDetail(creatorId, id, { authRedirect: false });
        const media = detail.media.find(
          (m) => galleryItemImageGridSrc(m) || galleryItemVideoPosterSrc(m)
        );
        next.set(
          id,
          media ? galleryItemImageGridSrc(media) ?? galleryItemVideoPosterSrc(media) : null
        );
      } catch {
        next.set(id, null);
      }
    })
  );
  return next;
}
