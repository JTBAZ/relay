"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildGalleryQuery,
  galleryParamsFromLayoutFilterQuery,
  relayFetch,
  type Collection,
  type GalleryItem,
  type GalleryListData,
  type PageLayout
} from "@/lib/relay-api";
import { dedupeShadowCoverRows } from "@/lib/gallery-group";

const SECTION_ITEM_LIMIT = 200;

export type LayoutSectionVisitorOptions = {
  visitor?: boolean;
  dev_sim_patron?: boolean;
  simulate_tier_ids?: string[];
};

/**
 * Loads gallery items per layout section (collection / filter / manual), with optional visitor
 * tier simulation (parity with `VisitorGalleryView` + `LayoutPreview`).
 */
export function useLayoutSectionItems(
  layout: PageLayout | null,
  creatorId: string,
  collections: Collection[],
  options: LayoutSectionVisitorOptions
) {
  const [sectionItems, setSectionItems] = useState<Record<string, GalleryItem[]>>({});
  const [loading, setLoading] = useState(false);

  const visitor = options.visitor ?? false;
  const { dev_sim_patron, simulate_tier_ids } = options;

  const loadSectionByPostIds = useCallback(
    async (sectionId: string, postIds: string[]) => {
      const u = new URLSearchParams();
      u.set("creator_id", creatorId);
      u.set("limit", String(SECTION_ITEM_LIMIT));
      if (visitor) u.set("visitor", "true");
      if (dev_sim_patron) u.set("dev_sim_patron", "true");
      for (const t of simulate_tier_ids ?? []) u.append("simulate_tier_ids", t);
      const data = await relayFetch<GalleryListData>(`/api/v1/gallery/items?${u}`);
      const filtered =
        postIds.length > 0 ? data.items.filter((it) => postIds.includes(it.post_id)) : data.items;
      const cleaned = dedupeShadowCoverRows(filtered);
      setSectionItems((prev) => ({ ...prev, [sectionId]: cleaned }));
    },
    [creatorId, visitor, dev_sim_patron, simulate_tier_ids]
  );

  const loadSectionByFilter = useCallback(
    async (sectionId: string, query: Record<string, unknown>) => {
      const filterParams = galleryParamsFromLayoutFilterQuery(query);
      const path = buildGalleryQuery({
        creator_id: creatorId,
        ...filterParams,
        limit: SECTION_ITEM_LIMIT,
        visitor,
        dev_sim_patron,
        simulate_tier_ids
      });
      const data = await relayFetch<GalleryListData>(path);
      const cleaned = dedupeShadowCoverRows(data.items);
      setSectionItems((prev) => ({ ...prev, [sectionId]: cleaned }));
    },
    [creatorId, visitor, dev_sim_patron, simulate_tier_ids]
  );

  useEffect(() => {
    if (!layout || !layout.sections.length) {
      setSectionItems({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setSectionItems({});

    const tasks: Promise<void>[] = [];
    for (const sec of layout.sections) {
      const { source } = sec;
      if (source.type === "filter") {
        tasks.push(loadSectionByFilter(sec.section_id, source.query));
        continue;
      }
      let postIds: string[] = [];
      if (source.type === "collection") {
        const col = collections.find((c) => c.collection_id === source.collection_id);
        postIds = col?.post_ids ?? [];
      } else {
        postIds = source.post_ids;
      }
      tasks.push(loadSectionByPostIds(sec.section_id, postIds));
    }

    void Promise.all(tasks)
      .catch(() => {
        /* sections may partially load */
      })
      .finally(() => setLoading(false));
  }, [layout, collections, loadSectionByPostIds, loadSectionByFilter]);

  return { sectionItems, loading };
}
