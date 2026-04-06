"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RELAY_API_BASE,
  relayFetch,
  buildGalleryFacetsQuery,
  type Collection as ApiCollection,
  type PageLayout as ApiPageLayout,
  type FacetsData,
  type VisitorHeroData
} from "@/lib/relay-api";
import type { PageLayout as DesignerPageLayout } from "@/lib/designer-mock";
import {
  apiCollectionsToDesigner,
  apiPageLayoutToDesigner,
  designerPageLayoutToApi,
  mergeDesignerAfterSave,
  seedEmptyDesignerLayout
} from "@/lib/designer-layout-bridge";
import { DesignerHeader } from "@/app/components/designer/designer-header";
import { InspectorRail } from "@/app/components/designer/inspector-rail";
import { CanvasPreview } from "@/app/components/designer/canvas-preview";

const defaultCreatorId =
  process.env.NEXT_PUBLIC_RELAY_CREATOR_ID?.trim() || "creator_1";

type PublishPreflight = {
  site_id: string;
  section_count: number;
  total_posts: number;
  layout_posts: number;
  remaining_posts: number;
  total_media: number;
  tiers: { tier_id: string; title: string }[];
};

function ResizeHandle({ onMouseDown }: { onMouseDown: React.MouseEventHandler }) {
  return (
    <div
      className="relative shrink-0 flex items-center justify-center cursor-col-resize select-none"
      style={{
        width: "5px",
        background: "var(--relay-border)",
        transition: "background 0.15s",
        zIndex: 10
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "var(--relay-green-600)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "var(--relay-border)")
      }
      aria-hidden="true"
    >
      <div className="flex flex-col gap-1 pointer-events-none">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block rounded-full"
            style={{
              width: "3px",
              height: "3px",
              background: "var(--relay-fg-subtle)"
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function DesignerView() {
  const [creatorId] = useState(defaultCreatorId);
  const [apiLayout, setApiLayout] = useState<ApiPageLayout | null>(null);
  const [collections, setCollections] = useState<ApiCollection[]>([]);
  const [designerLayout, setDesignerLayout] = useState<DesignerPageLayout | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishPreflight, setPublishPreflight] = useState<PublishPreflight | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [visitorHero, setVisitorHero] = useState<VisitorHeroData | null>(null);
  const [facets, setFacets] = useState<FacetsData | null>(null);

  const [inspectorWidth, setInspectorWidth] = useState(300);
  const MIN_INSPECTOR = 240;
  const MAX_INSPECTOR = 480;
  const dragging = useRef(false);

  const designerCollections = apiCollectionsToDesigner(collections);

  // Paid Patreon tiers only — excludes relay_tier_public, relay_tier_all_patrons,
  // and any $0 / "Public" / "Free" tier. Sorted cheapest→most expensive.
  // Used for lock state calculation AND the "Viewing as" tier switcher.
  const tierOrderIds = useMemo(() => {
    if (!facets?.tiers?.length) return [];
    return [...facets.tiers]
      .filter((t) => {
        if (t.tier_id === "relay_tier_public" || t.tier_id === "relay_tier_all_patrons") return false;
        // Exclude $0 / named-free tiers (Patreon sometimes ships a "Free" or "Public" tier)
        if (typeof t.amount_cents === "number" && t.amount_cents === 0) return false;
        const n = t.title.trim().toLowerCase();
        if (n === "public" || n === "free") return false;
        return true;
      })
      .sort((a, b) => (a.amount_cents ?? 0) - (b.amount_cents ?? 0))
      .map((t) => t.tier_id);
  }, [facets]);

  const tierTitleById = useMemo(() => {
    const o: Record<string, string> = {};
    for (const t of facets?.tiers ?? []) {
      o[t.tier_id] = t.title;
    }
    return o;
  }, [facets]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const u = new URLSearchParams();
      u.set("creator_id", creatorId);

      let cols: ApiCollection[] = [];
      try {
        const res = await relayFetch<{ items: ApiCollection[] }>(
          `/api/v1/gallery/collections?${u.toString()}`
        );
        cols = res.items;
      } catch {
        cols = [];
      }

      let heroData: VisitorHeroData | null = null;
      let facetsData: FacetsData | null = null;
      try {
        facetsData = await relayFetch<FacetsData>(buildGalleryFacetsQuery(creatorId, true));
        heroData = facetsData.visitor_hero ?? null;
      } catch {
        heroData = null;
        facetsData = null;
      }

      let layout: ApiPageLayout;
      try {
        layout = await relayFetch<ApiPageLayout>(`/api/v1/gallery/layout?${u.toString()}`);
        if (!cancelled) setLoadError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!cancelled) setLoadError(msg);
        layout = {
          creator_id: creatorId,
          theme: { color_scheme: "dark" },
          sections: [],
          updated_at: new Date().toISOString()
        };
      }

      if (cancelled) return;
      setCollections(cols);
      setApiLayout(layout);
      setVisitorHero(heroData);
      setFacets(facetsData);
      const shouldSeed = layout.sections.length === 0;
      let nextDesigner = apiPageLayoutToDesigner(layout, cols, creatorId, heroData);
      if (shouldSeed) {
        nextDesigner = seedEmptyDesignerLayout(nextDesigner, cols);
      }
      setDesignerLayout(nextDesigner);
      setDirty(shouldSeed);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  const handleLayoutChange = (updated: DesignerPageLayout) => {
    setDesignerLayout(updated);
    setDirty(true);
  };

  const saveLayout = async () => {
    if (!apiLayout || !designerLayout) return;
    setSaving(true);
    try {
      const body = designerPageLayoutToApi(designerLayout, apiLayout);
      const res = await fetch(`${RELAY_API_BASE}/api/v1/gallery/layout`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = (await res.json()) as {
        data?: ApiPageLayout;
        error?: { message: string };
      };
      if (!res.ok) throw new Error(json.error?.message ?? res.statusText);
      const next = json.data;
      if (!next) throw new Error("Invalid layout response");
      setApiLayout(next);
      setDesignerLayout((prev) =>
        prev
          ? mergeDesignerAfterSave(
              prev,
              apiPageLayoutToDesigner(next, collections, creatorId, visitorHero)
            )
          : apiPageLayoutToDesigner(next, collections, creatorId, visitorHero)
      );
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const runPublishPreflight = useCallback(async () => {
    setPublishing(true);
    try {
      const result = await relayFetch<PublishPreflight>("/api/v1/gallery/publish", {
        method: "POST",
        body: JSON.stringify({ creator_id: creatorId })
      });
      setPublishPreflight(result);
    } finally {
      setPublishing(false);
    }
  }, [creatorId]);

  const handlePublishConfirm = useCallback(() => {
    setDesignerLayout((prev) =>
      prev
        ? {
            ...prev,
            published: true,
            lastPublishedAt: new Date().toISOString()
          }
        : prev
    );
    void runPublishPreflight();
  }, [runPublishPreflight]);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      const startX = e.clientX;
      const startWidth = inspectorWidth;
      function onMove(ev: MouseEvent) {
        if (!dragging.current) return;
        const delta = ev.clientX - startX;
        setInspectorWidth(
          Math.max(MIN_INSPECTOR, Math.min(MAX_INSPECTOR, startWidth + delta))
        );
      }
      function onUp() {
        dragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [inspectorWidth]
  );

  if (!designerLayout || !apiLayout) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-[#8a7f72]">
        <p>Loading designer…</p>
        <p className="text-[10px]">
          Make sure the API server is running (
          <code className="text-[#ede5da]">npm run build &amp;&amp; npm start</code> in the API package).
        </p>
      </div>
    );
  }

  return (
    <div
      className="designer-site-shell flex min-h-0 flex-1 flex-col"
      style={{
        height: "calc(100dvh - var(--relay-app-nav-height))",
        background: "var(--relay-bg)",
        color: "var(--relay-fg)"
      }}
    >
      <DesignerHeader
        layout={designerLayout}
        hasUnsavedChanges={dirty}
        onSave={() => void saveLayout()}
        isSaving={saving}
        publishDisabled={dirty || publishing}
        onPublish={handlePublishConfirm}
      />

      {loadError ? (
        <div
          className="mx-4 mt-2 rounded border px-3 py-2 text-sm"
          style={{
            borderColor: "#7f1d1d",
            background: "var(--relay-green-950)",
            color: "var(--relay-fg-muted)"
          }}
        >
          <strong className="mb-1 block text-xs uppercase tracking-wide" style={{ color: "#f87171" }}>
            Could not load layout
          </strong>
          {loadError}
        </div>
      ) : null}

      <p
        className="mx-4 mt-2 text-[10px] leading-relaxed"
        style={{ color: "var(--relay-fg-subtle)" }}
      >
        Shop, engagement blocks, and announcement banners are preview-only in the canvas; Library sections, hero,
        and theme save to the Relay layout API.
      </p>

      <div className="flex flex-1 min-h-0 overflow-hidden" style={{ flexDirection: "row" }}>
        <div
          className="hidden md:flex flex-col overflow-hidden shrink-0"
          style={{ width: `${inspectorWidth}px` }}
        >
          <InspectorRail
            layout={designerLayout}
            collections={designerCollections}
            onLayoutChange={handleLayoutChange}
          />
        </div>

        <ResizeHandle onMouseDown={handleResizeMouseDown} />

        <div className="flex-1 min-w-0 overflow-hidden">
          <CanvasPreview
            layout={designerLayout}
            collections={designerCollections}
            creatorId={creatorId}
            apiLayout={apiLayout}
            apiCollections={collections}
            tierOrderIds={tierOrderIds}
            tierTitleById={tierTitleById}
            facets={facets}
            patreonSlug={visitorHero?.patreon_name?.trim().toLowerCase() ?? null}
          />
        </div>
      </div>

      <div
        className="md:hidden border-t overflow-y-auto"
        style={{
          borderColor: "var(--relay-border)",
          maxHeight: "45dvh",
          background: "var(--relay-surface-1)"
        }}
      >
        <InspectorRail
          layout={designerLayout}
          collections={designerCollections}
          onLayoutChange={handleLayoutChange}
        />
      </div>

      {publishPreflight ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.8)" }}
          role="dialog"
          aria-modal
          onClick={() => setPublishPreflight(null)}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-lg border p-6"
            style={{
              borderColor: "var(--relay-border)",
              background: "var(--relay-surface-1)",
              color: "var(--relay-fg-muted)"
            }}
            onClick={(e_) => e_.stopPropagation()}
          >
            <h3 className="text-lg" style={{ color: "var(--relay-fg)" }}>
              Publish preflight
            </h3>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium" style={{ color: "var(--relay-green-400)" }}>
                  {publishPreflight.section_count}
                </span>{" "}
                sections
              </p>
              <p>
                <span className="font-medium" style={{ color: "var(--relay-green-400)" }}>
                  {publishPreflight.layout_posts}
                </span>{" "}
                posts from layout,{" "}
                <span style={{ color: "var(--relay-fg-subtle)" }}>
                  {publishPreflight.remaining_posts} additional
                </span>
              </p>
              <p>
                <span className="font-medium" style={{ color: "var(--relay-green-400)" }}>
                  {publishPreflight.total_posts}
                </span>{" "}
                total posts ·{" "}
                <span className="font-medium" style={{ color: "var(--relay-green-400)" }}>
                  {publishPreflight.total_media}
                </span>{" "}
                media
              </p>
              {publishPreflight.tiers.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {publishPreflight.tiers.map((t) => (
                    <span
                      key={t.tier_id}
                      className="rounded border px-2 py-0.5 text-[10px]"
                      style={{ borderColor: "var(--relay-border)" }}
                    >
                      {t.title}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPublishPreflight(null)}
                className="rounded border px-4 py-2 text-xs"
                style={{
                  borderColor: "var(--relay-border)",
                  color: "var(--relay-fg-muted)"
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setPublishPreflight(null)}
                className="rounded px-4 py-2 text-xs text-white"
                style={{ background: "var(--relay-green-600)" }}
              >
                Confirm &amp; publish
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
