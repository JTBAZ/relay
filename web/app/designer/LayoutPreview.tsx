"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RELAY_API_BASE,
  buildGalleryQuery,
  galleryParamsFromLayoutFilterQuery,
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
  /** Viewport width for responsive preview (px). */
  previewWidth?: number;
  className?: string;
};

const schemeBg: Record<string, string> = {
  dark: "bg-[#100c0a] text-[#ede5da]",
  light: "bg-[#f5f0eb] text-[#1a1410]",
  warm: "bg-[#2a1f17] text-[#f0e6d8]"
};

function exportContentUrl(creatorId: string, mediaId: string): string {
  return `${RELAY_API_BASE}/api/v1/export/media/${encodeURIComponent(creatorId)}/${encodeURIComponent(mediaId)}/content`;
}

const PREVIEW_ITEM_LIMIT = 200;

export default function LayoutPreview({
  layout,
  creatorId,
  collections,
  previewWidth = 1280,
  className = ""
}: Props) {
  const [sectionItems, setSectionItems] = useState<Record<string, GalleryItem[]>>({});

  const loadSectionByPostIds = useCallback(
    async (sectionId: string, postIds: string[]) => {
      const u = new URLSearchParams();
      u.set("creator_id", creatorId);
      u.set("limit", String(PREVIEW_ITEM_LIMIT));
      const data = await relayFetch<GalleryListData>(`/api/v1/gallery/items?${u}`);
      const filtered =
        postIds.length > 0 ? data.items.filter((it) => postIds.includes(it.post_id)) : data.items;
      setSectionItems((prev) => ({ ...prev, [sectionId]: filtered }));
    },
    [creatorId]
  );

  const loadSectionByFilter = useCallback(
    async (sectionId: string, query: Record<string, unknown>) => {
      const filterParams = galleryParamsFromLayoutFilterQuery(query);
      const path = buildGalleryQuery({
        creator_id: creatorId,
        ...filterParams,
        limit: PREVIEW_ITEM_LIMIT
      });
      const data = await relayFetch<GalleryListData>(path);
      setSectionItems((prev) => ({ ...prev, [sectionId]: data.items }));
    },
    [creatorId]
  );

  useEffect(() => {
    for (const sec of layout.sections) {
      const { source } = sec;
      if (source.type === "filter") {
        void loadSectionByFilter(sec.section_id, source.query);
        continue;
      }
      let postIds: string[] = [];
      if (source.type === "collection") {
        const col = collections.find((c) => c.collection_id === source.collection_id);
        postIds = col?.post_ids ?? [];
      } else {
        postIds = source.post_ids;
      }
      void loadSectionByPostIds(sec.section_id, postIds);
    }
  }, [layout.sections, collections, loadSectionByPostIds, loadSectionByFilter]);

  const bg = schemeBg[layout.theme.color_scheme] ?? schemeBg.dark;
  const accent = layout.theme.accent_color ?? "#c45c2d";
  const heroCoverId = layout.hero?.cover_media_id?.trim();
  const heroCoverUrl = heroCoverId ? exportContentUrl(creatorId, heroCoverId) : null;
  const narrow = previewWidth < 640;

  const tileMotion =
    "motion-safe:transition-[transform,box-shadow] motion-safe:duration-300 motion-safe:ease-out hover:z-[1] hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.55)]";

  return (
    <div
      className={`mx-auto w-full min-h-[min(100%,520px)] overflow-hidden rounded-xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.65)] ${bg} ${className}`}
      style={{ maxWidth: previewWidth }}
    >
      {layout.hero ? (
        <div className="relative isolate overflow-hidden">
          {heroCoverUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroCoverUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25"
                aria-hidden
              />
            </>
          ) : (
            <div className="absolute inset-0 bg-current/[0.04]" aria-hidden />
          )}
          <div
            className={`relative text-center ${narrow ? "px-5 py-12" : "px-10 py-16 md:py-20"} border-b border-white/10`}
          >
            <h1
              className={`font-[family-name:var(--font-display)] font-semibold tracking-tight ${narrow ? "text-2xl" : "text-3xl sm:text-4xl md:text-5xl"}`}
              style={{ color: heroCoverUrl ? "#f5f0eb" : accent }}
            >
              {layout.hero.title}
            </h1>
            {layout.hero.subtitle ? (
              <p
                className={`mt-3 max-w-xl mx-auto leading-relaxed ${heroCoverUrl ? "text-white/85" : "opacity-70"} ${narrow ? "text-sm" : "text-base"}`}
              >
                {layout.hero.subtitle}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={narrow ? "px-3 py-6" : "px-5 py-8 md:px-8"}>
        {layout.sections
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((sec) => {
            const items = sectionItems[sec.section_id] ?? [];
            const display = sec.max_items ? items.slice(0, sec.max_items) : items;
            const cols = Math.min(sec.columns ?? 3, narrow ? 2 : 6);

            return (
              <section key={sec.section_id} className="mb-10 last:mb-0">
                <div className="mb-4 flex items-end gap-3 border-b border-current/10 pb-3">
                  <h2
                    className={`font-[family-name:var(--font-display)] font-medium tracking-tight ${narrow ? "text-lg" : "text-xl md:text-2xl"}`}
                    style={{ color: accent }}
                  >
                    {sec.title}
                  </h2>
                </div>
                {display.length === 0 ? (
                  <p className="text-xs opacity-50">No items to display</p>
                ) : sec.layout === "list" ? (
                  <div className="space-y-2">
                    {display.map((it) => (
                      <div
                        key={`${it.post_id}::${it.media_id}`}
                        className="flex items-center gap-3 rounded-lg bg-current/[0.06] p-2.5 motion-safe:transition-colors motion-safe:duration-200 hover:bg-current/[0.1]"
                      >
                        {it.has_export && it.mime_type?.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`${RELAY_API_BASE}${it.content_url_path}`}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-current/10 text-[10px] opacity-50">
                            {it.mime_type?.split("/")[0] ?? "text"}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{it.title}</p>
                          <p className="text-[10px] opacity-50">{it.published_at.slice(0, 10)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className="gap-3 md:gap-4"
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
                    }}
                  >
                    {display.map((it) => (
                      <article
                        key={`${it.post_id}::${it.media_id}`}
                        className={`group relative overflow-hidden rounded-lg bg-current/[0.06] ${tileMotion}`}
                      >
                        <div className="relative overflow-hidden">
                          {it.has_export && it.mime_type?.startsWith("image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`${RELAY_API_BASE}${it.content_url_path}`}
                              alt=""
                              className={`w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out group-hover:scale-[1.03] ${sec.layout === "masonry" ? "max-h-80 min-h-[10rem]" : "aspect-square"}`}
                            />
                          ) : (
                            <div className="flex aspect-square items-center justify-center text-xs opacity-40">
                              {it.mime_type?.split("/")[0] ?? "text"}
                            </div>
                          )}
                          {it.has_export && it.mime_type?.startsWith("image/") ? (
                            <div
                              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-80 motion-safe:transition-opacity motion-safe:duration-300 group-hover:opacity-95"
                              aria-hidden
                            />
                          ) : null}
                          <div className="absolute inset-x-0 bottom-0 p-2.5 pt-8">
                            <p className="truncate text-xs font-medium text-white drop-shadow-sm md:text-sm">
                              {it.title}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}

        {layout.sections.length === 0 && !layout.hero ? (
          <div className="flex h-48 items-center justify-center text-sm opacity-40">
            Add a hero or sections to see a preview
          </div>
        ) : null}
        {layout.sections.length === 0 && layout.hero ? (
          <div className="flex h-32 items-center justify-center text-sm opacity-40">
            Add sections to show work below the hero
          </div>
        ) : null}
      </div>
    </div>
  );
}
