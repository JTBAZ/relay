"use client";

import { useEffect, useRef, useState } from "react";
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
  const fetchGeneration = useRef(0);

  const visitor = options.visitor ?? false;
  const { dev_sim_patron, simulate_tier_ids } = options;

  useEffect(() => {
    if (!layout || !layout.sections.length) {
      fetchGeneration.current += 1;
      setSectionItems({});
      setLoading(false);
      return;
    }

    const gen = ++fetchGeneration.current;
    setLoading(true);
    setSectionItems({});

    void (async () => {
      const pairs = await Promise.all(
        layout.sections.map(async (sec) => {
          const { source } = sec;
          try {
            if (source.type === "filter") {
              const filterParams = galleryParamsFromLayoutFilterQuery(source.query);
              const path = buildGalleryQuery({
                creator_id: creatorId,
                ...filterParams,
                limit: SECTION_ITEM_LIMIT,
                visitor,
                dev_sim_patron,
                simulate_tier_ids
              });
              const data = await relayFetch<GalleryListData>(path);
              return [sec.section_id, dedupeShadowCoverRows(data.items)] as const;
            }

            let postIds: string[] = [];
            if (source.type === "collection") {
              const col = collections.find((c) => c.collection_id === source.collection_id);
              postIds = col?.post_ids ?? [];
            } else {
              postIds = source.post_ids;
            }

            const u = new URLSearchParams();
            u.set("creator_id", creatorId);
            u.set("limit", String(SECTION_ITEM_LIMIT));
            if (visitor) u.set("visitor", "true");
            if (dev_sim_patron) u.set("dev_sim_patron", "true");
            for (const t of simulate_tier_ids ?? []) u.append("simulate_tier_ids", t);
            const data = await relayFetch<GalleryListData>(`/api/v1/gallery/items?${u}`);
            const filtered =
              postIds.length > 0 ? data.items.filter((it) => postIds.includes(it.post_id)) : data.items;
            return [sec.section_id, dedupeShadowCoverRows(filtered)] as const;
          } catch {
            return [sec.section_id, [] as GalleryItem[]] as const;
          }
        })
      );

      if (gen !== fetchGeneration.current) return;

      const next: Record<string, GalleryItem[]> = {};
      for (const [sectionId, items] of pairs) {
        next[sectionId] = items;
      }
      setSectionItems(next);
      setLoading(false);
    })();
  }, [layout, collections, creatorId, visitor, dev_sim_patron, simulate_tier_ids]);

  return { sectionItems, loading };
}
