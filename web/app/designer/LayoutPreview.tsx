"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RELAY_API_BASE,
  relayFetch,
  type Collection,
  type GalleryItem,
  type GalleryListData,
  type PageLayout
} from "@/lib/relay-api";

type Props = {
  layout: PageLayout;
  creatorId: string;
  collections: Collection[];
};

const schemeBg: Record<string, string> = {
  dark: "bg-[#100c0a] text-[#ede5da]",
  light: "bg-[#f5f0eb] text-[#1a1410]",
  warm: "bg-[#2a1f17] text-[#f0e6d8]"
};

export default function LayoutPreview({ layout, creatorId, collections }: Props) {
  const [sectionItems, setSectionItems] = useState<Record<string, GalleryItem[]>>({});

  const loadSection = useCallback(
    async (sectionId: string, postIds: string[]) => {
      const u = new URLSearchParams();
      u.set("creator_id", creatorId);
      u.set("limit", "200");
      const data = await relayFetch<GalleryListData>(`/api/v1/gallery/items?${u}`);
      const filtered = postIds.length > 0
        ? data.items.filter((it) => postIds.includes(it.post_id))
        : data.items;
      setSectionItems((prev) => ({ ...prev, [sectionId]: filtered }));
    },
    [creatorId]
  );

  useEffect(() => {
    for (const sec of layout.sections) {
      let postIds: string[] = [];
      const { source } = sec;
      if (source.type === "collection") {
        const col = collections.find((c) => c.collection_id === source.collection_id);
        postIds = col?.post_ids ?? [];
      } else if (source.type === "manual") {
        postIds = source.post_ids;
      }
      void loadSection(sec.section_id, postIds);
    }
  }, [layout.sections, collections, loadSection]);

  const bg = schemeBg[layout.theme.color_scheme] ?? schemeBg.dark;
  const accent = layout.theme.accent_color ?? "#c45c2d";

  return (
    <div className={`rounded-lg border border-[#3d342b] p-4 min-h-[400px] ${bg}`}>
      {layout.hero ? (
        <div className="text-center py-8 mb-6 border-b border-current/10">
          <h1 className="text-2xl font-bold" style={{ color: accent }}>
            {layout.hero.title}
          </h1>
          {layout.hero.subtitle ? (
            <p className="mt-2 opacity-70">{layout.hero.subtitle}</p>
          ) : null}
        </div>
      ) : null}

      {layout.sections
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((sec) => {
          const items = sectionItems[sec.section_id] ?? [];
          const display = sec.max_items ? items.slice(0, sec.max_items) : items;
          const cols = sec.columns ?? 3;

          return (
            <div key={sec.section_id} className="mb-6">
              <h2 className="text-lg font-semibold mb-3" style={{ color: accent }}>
                {sec.title}
              </h2>
              {display.length === 0 ? (
                <p className="text-xs opacity-50">No items to display</p>
              ) : sec.layout === "list" ? (
                <div className="space-y-2">
                  {display.map((it) => (
                    <div
                      key={`${it.post_id}::${it.media_id}`}
                      className="flex items-center gap-3 p-2 rounded bg-current/5"
                    >
                      {it.has_export && it.mime_type?.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${RELAY_API_BASE}${it.content_url_path}`}
                          alt=""
                          className="w-12 h-12 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-current/10 flex items-center justify-center text-[10px] opacity-50">
                          {it.mime_type?.split("/")[0] ?? "text"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{it.title}</p>
                        <p className="text-[10px] opacity-50">{it.published_at.slice(0, 10)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="gap-3"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
                  }}
                >
                  {display.map((it) => (
                    <div
                      key={`${it.post_id}::${it.media_id}`}
                      className="rounded overflow-hidden bg-current/5"
                    >
                      {it.has_export && it.mime_type?.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${RELAY_API_BASE}${it.content_url_path}`}
                          alt=""
                          className={`w-full object-cover ${sec.layout === "masonry" ? "" : "aspect-square"}`}
                        />
                      ) : (
                        <div className="aspect-square flex items-center justify-center text-xs opacity-40">
                          {it.mime_type?.split("/")[0] ?? "text"}
                        </div>
                      )}
                      <div className="p-2">
                        <p className="text-xs truncate">{it.title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

      {layout.sections.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm opacity-40">
          Add sections to see a preview
        </div>
      ) : null}
    </div>
  );
}
