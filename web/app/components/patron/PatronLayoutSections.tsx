"use client";

import {
  RELAY_API_BASE,
  type GalleryItem,
  type PageLayout,
  type TierFacet
} from "@/lib/relay-api";
import { sortGalleryItemsForArrangement } from "@/lib/gallery-item-sort";
import { pickPrimaryAccessTierIdForChip } from "@/lib/tier-access";

type Props = {
  layout: PageLayout;
  sectionItems: Record<string, GalleryItem[]>;
  loading: boolean;
  onOpenItem: (item: GalleryItem) => void;
  /** Facet tier order (low→high); used for tier-based sorting */
  tierOrderIds: string[];
  tierTitleById: Record<string, string>;
  /** Campaign tier rows — resolves access chip when IDs are not in `tierOrderIds` */
  tierFacets: TierFacet[];
};

function tierBadgeLabel(
  item: GalleryItem,
  tierFacets: TierFacet[],
  tierTitleById: Record<string, string>
): string | null {
  if (!item.tier_ids?.length) return null;
  const id = pickPrimaryAccessTierIdForChip(item.tier_ids, tierFacets);
  if (!id) return null;
  const t = tierTitleById[id]?.trim();
  return t || id;
}

const schemeBg: Record<string, string> = {
  dark: "bg-[#0a0a0a] text-[#f9fafb]",
  light: "bg-[#f5f0eb] text-[#1a1410]",
  warm: "bg-[#2a1f17] text-[#f0e6d8]"
};

export default function PatronLayoutSections({
  layout,
  sectionItems,
  loading,
  onOpenItem,
  tierOrderIds,
  tierTitleById,
  tierFacets
}: Props) {
  const bg = schemeBg[layout.theme.color_scheme] ?? schemeBg.dark;
  const accent = layout.theme.accent_color ?? "#40916c";
  const showTierBadges = layout.theme.show_tier_badges ?? true;
  const arrMode = layout.theme.gallery_arrangement ?? "chronological";

  const sorted = [...layout.sections].sort((a, b) => a.sort_order - b.sort_order);

  if (loading && sorted.length > 0 && Object.keys(sectionItems).length === 0) {
    return (
      <div className={`rounded-xl border border-white/10 px-6 py-16 text-center text-sm opacity-70 ${bg}`}>
        Loading curated sections…
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.65)] ${bg}`}>
      <div className="px-4 py-8 md:px-8">
        {sorted.map((sec) => {
          const raw = sectionItems[sec.section_id] ?? [];
          const items = sortGalleryItemsForArrangement(raw, arrMode, tierOrderIds);
          const display = sec.max_items ? items.slice(0, sec.max_items) : items;
          const cols = Math.min(sec.columns ?? 3, 3);
          const narrow = false;

          return (
            <section key={sec.section_id} className="mb-12 last:mb-0">
              <div className="mb-4 flex items-end gap-3 border-b border-current/10 pb-3">
                <h2
                  className={`font-[family-name:var(--font-display)] font-medium tracking-tight ${narrow ? "text-lg" : "text-xl md:text-2xl"}`}
                  style={{ color: accent }}
                >
                  {sec.title}
                </h2>
              </div>
              {display.length === 0 ? (
                <p className="text-xs opacity-50">No public items in this section yet.</p>
              ) : sec.layout === "list" ? (
                <div className="space-y-2">
                  {display.map((it) => {
                    const tierLabel = showTierBadges
                      ? tierBadgeLabel(it, tierFacets, tierTitleById)
                      : null;
                    return (
                    <button
                      key={`${it.post_id}::${it.media_id}`}
                      type="button"
                      onClick={() => onOpenItem(it)}
                      className="flex w-full items-center gap-3 rounded-lg bg-current/[0.06] p-2.5 text-left motion-safe:transition-colors motion-safe:duration-200 hover:bg-current/[0.1]"
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
                          {it.mime_type?.split("/")[0] ?? "media"}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{it.title}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <p className="text-[10px] opacity-50">{it.published_at.slice(0, 10)}</p>
                          {tierLabel ? (
                            <span className="text-[10px] font-medium opacity-80">{tierLabel}</span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                  })}
                </div>
              ) : (
                <div
                  className="gap-3 md:gap-4"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`
                  }}
                >
                  {display.map((it) => {
                    const tierLabel = showTierBadges
                      ? tierBadgeLabel(it, tierFacets, tierTitleById)
                      : null;
                    return (
                    <button
                      key={`${it.post_id}::${it.media_id}`}
                      type="button"
                      onClick={() => onOpenItem(it)}
                      className="group relative overflow-hidden rounded-lg bg-current/[0.06] text-left motion-safe:transition-[transform,box-shadow] motion-safe:duration-300 motion-safe:ease-out hover:z-[1] hover:-translate-y-0.5 hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.55)]"
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
                            {it.mime_type?.split("/")[0] ?? "media"}
                          </div>
                        )}
                        {tierLabel ? (
                          <span
                            className="absolute right-2 top-2 max-w-[min(100%,8rem)] truncate rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-medium text-white/95 backdrop-blur-sm"
                            title={tierLabel}
                          >
                            {tierLabel}
                          </span>
                        ) : null}
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
                    </button>
                  );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
