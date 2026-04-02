"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  RELAY_API_BASE,
  relayFetch,
  type Collection,
  type PageLayout,
  type PageSection
} from "@/lib/relay-api";
import ThemePicker from "./ThemePicker";
import HeroEditor from "./HeroEditor";
import SectionEditor from "./SectionEditor";
import LayoutPreview from "./LayoutPreview";
import DesignerPreviewToolbar from "./DesignerPreviewToolbar";

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

export default function DesignerView() {
  const searchParams = useSearchParams();
  const [creatorId] = useState(defaultCreatorId);
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishPreflight, setPublishPreflight] = useState<PublishPreflight | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(1280);

  const loadLayout = useCallback(async () => {
    setLoadError(null);
    try {
      const u = new URLSearchParams();
      u.set("creator_id", creatorId);
      const data = await relayFetch<PageLayout>(`/api/v1/gallery/layout?${u}`);
      setLayout(data);
      setDirty(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg);
      setLayout({
        creator_id: creatorId,
        theme: { color_scheme: "dark" },
        sections: [],
        updated_at: new Date().toISOString()
      });
    }
  }, [creatorId]);

  const loadCollections = useCallback(async () => {
    try {
      const u = new URLSearchParams();
      u.set("creator_id", creatorId);
      const res = await relayFetch<{ items: Collection[] }>(`/api/v1/gallery/collections?${u}`);
      setCollections(res.items);
    } catch {
      setCollections([]);
    }
  }, [creatorId]);

  useEffect(() => {
    void loadLayout();
    void loadCollections();
  }, [loadLayout, loadCollections]);

  useEffect(() => {
    const raw = searchParams.get("highlight");
    if (!raw?.startsWith("collection:")) return;
    const collectionId = decodeURIComponent(raw.slice("collection:".length));
    const t = window.setTimeout(() => {
      const esc =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(collectionId)
          : collectionId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const el = document.querySelector(`[data-designer-collection="${esc}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (el) {
        const prev = el.style.boxShadow;
        el.style.boxShadow = "0 0 0 2px rgba(232, 160, 119, 0.55)";
        window.setTimeout(() => {
          el.style.boxShadow = prev;
        }, 2200);
      }
    }, 180);
    return () => window.clearTimeout(t);
  }, [searchParams, layout?.sections]);

  const saveLayout = async () => {
    if (!layout) return;
    setSaving(true);
    try {
      await fetch(`${RELAY_API_BASE}/api/v1/gallery/layout`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(layout)
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const updateLayout = (patch: Partial<PageLayout>) => {
    if (!layout) return;
    setLayout({ ...layout, ...patch });
    setDirty(true);
  };

  const addSection = async () => {
    const section = await relayFetch<PageSection>("/api/v1/gallery/layout/sections", {
      method: "POST",
      body: JSON.stringify({
        creator_id: creatorId,
        title: "New Section",
        source: { type: "manual", post_ids: [] },
        layout: "grid"
      })
    });
    setLayout((prev) =>
      prev ? { ...prev, sections: [...prev.sections, section] } : prev
    );
    setDirty(true);
  };

  const updateSection = (sectionId: string, patch: Partial<PageSection>) => {
    if (!layout) return;
    setLayout({
      ...layout,
      sections: layout.sections.map((s) =>
        s.section_id === sectionId ? { ...s, ...patch } : s
      )
    });
    setDirty(true);
  };

  const removeSection = (sectionId: string) => {
    if (!layout) return;
    setLayout({
      ...layout,
      sections: layout.sections.filter((s) => s.section_id !== sectionId)
    });
    setDirty(true);
  };

  const runPublishPreflight = async () => {
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
  };

  const moveSection = (sectionId: string, direction: -1 | 1) => {
    if (!layout) return;
    const sorted = [...layout.sections].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((s) => s.section_id === sectionId);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const temp = sorted[idx].sort_order;
    sorted[idx].sort_order = sorted[targetIdx].sort_order;
    sorted[targetIdx].sort_order = temp;
    setLayout({ ...layout, sections: sorted });
    setDirty(true);
  };

  if (!layout) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-[#8a7f72]">
        <p>Loading designer…</p>
        <p className="text-[10px]">
          Make sure the API server is running and rebuilt (
          <code className="text-[#ede5da]">npm run build &amp;&amp; npm start</code>)
        </p>
      </div>
    );
  }

  const sortedSections = [...layout.sections].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0807] text-[#ede5da]">
      <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-[#2a2420] bg-[#120e0c]/95 px-4 py-3 backdrop-blur-md sm:px-6">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8]">Designer</h2>
          <p className="mt-0.5 max-w-md text-[10px] leading-relaxed text-[#8a7f72]">
            Stage for your patron-facing page. Structure on the left; preview at right. Library controls
            visibility per file; collections and tags feed sections and search.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {dirty ? (
            <span className="text-[10px] text-[#e8a077]">Unsaved changes</span>
          ) : null}
          <button
            type="button"
            onClick={() => void saveLayout()}
            disabled={saving || !dirty}
            className="rounded-md bg-[#8b3a1a] px-4 py-1.5 text-xs text-white disabled:opacity-50 motion-safe:transition-opacity"
          >
            {saving ? "Saving…" : "Save layout"}
          </button>
          <button
            type="button"
            onClick={() => void runPublishPreflight()}
            disabled={publishing || dirty}
            className="rounded-md bg-[#2d6a5c] px-4 py-1.5 text-xs text-white disabled:opacity-50 motion-safe:transition-opacity"
            title={dirty ? "Save layout first" : "Publish to patron site"}
          >
            {publishing ? "Preparing…" : "Publish"}
          </button>
        </div>
      </header>

      {loadError ? (
        <div className="mx-4 mt-2 rounded border border-[#8b3a1a] bg-[#2a1810] px-3 py-2 text-sm text-[#f0c4b8]">
          <strong className="mb-1 block text-xs uppercase tracking-wide text-[#e8a077]">
            Failed to load layout from API
          </strong>
          {loadError}
          <p className="mt-1 text-[10px] text-[#b8a995]">
            Using default empty layout. Run{" "}
            <code className="text-[#ede5da]">npm run build &amp;&amp; npm start</code> to rebuild the API
            server.
          </p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex max-h-[min(42vh,520px)] w-full shrink-0 flex-col overflow-y-auto border-b border-[#2a2420] bg-[#141210] px-4 py-5 lg:max-h-none lg:w-[min(400px,100%)] lg:max-w-[420px] lg:border-b-0 lg:border-r lg:border-[#2a2420]">
          <div className="space-y-6">
            <section>
              <h3 className="mb-3 font-[family-name:var(--font-display)] text-base text-[#f0e6d8]">Theme</h3>
              <ThemePicker
                colorScheme={layout.theme.color_scheme}
                accentColor={layout.theme.accent_color}
                onChange={(scheme, accent) =>
                  updateLayout({ theme: { color_scheme: scheme, accent_color: accent } })
                }
              />
            </section>

            <section>
              <h3 className="mb-3 font-[family-name:var(--font-display)] text-base text-[#f0e6d8]">Hero</h3>
              <HeroEditor hero={layout.hero} onChange={(hero) => updateLayout({ hero })} />
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-[family-name:var(--font-display)] text-base text-[#f0e6d8]">Sections</h3>
                <button
                  type="button"
                  onClick={() => void addSection()}
                  className="rounded bg-[#4a3728] px-2 py-0.5 text-xs text-[#ede5da] hover:bg-[#5c4a38]"
                >
                  + Add
                </button>
              </div>
              {sortedSections.map((sec, i) => (
                <SectionEditor
                  key={sec.section_id}
                  section={sec}
                  collections={collections}
                  onUpdate={(patch) => updateSection(sec.section_id, patch)}
                  onRemove={() => removeSection(sec.section_id)}
                  onMoveUp={() => moveSection(sec.section_id, -1)}
                  onMoveDown={() => moveSection(sec.section_id, 1)}
                  isFirst={i === 0}
                  isLast={i === sortedSections.length - 1}
                />
              ))}
              {sortedSections.length === 0 ? (
                <p className="text-xs text-[#8a7f72]">
                  No sections yet. Add one, or define collections in the Library and source a section from
                  them.
                </p>
              ) : null}
            </section>
          </div>
        </aside>

        <div className="flex min-h-[min(70vh,900px)] min-w-0 flex-1 flex-col bg-[#060504] lg:min-h-[calc(100vh-8.5rem)]">
          <DesignerPreviewToolbar previewWidth={previewWidth} onPreviewWidth={setPreviewWidth} />
          <div className="relative flex-1 overflow-auto motion-safe:transition-[background] motion-safe:duration-300">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(196,92,45,0.06),_transparent_55%)]"
              aria-hidden
            />
            <div className="relative flex min-h-full justify-center px-3 py-6 sm:px-6 sm:py-10">
              <LayoutPreview
                layout={layout}
                creatorId={creatorId}
                collections={collections}
                previewWidth={previewWidth}
                className="motion-safe:transition-[max-width] motion-safe:duration-300 motion-safe:ease-out"
              />
            </div>
          </div>
        </div>
      </div>

      {publishPreflight ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          role="dialog"
          aria-modal
          onClick={() => setPublishPreflight(null)}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-lg border border-[#3d342b] bg-[#1a1410] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8]">
              Publish preflight
            </h3>
            <div className="space-y-2 text-sm text-[#d8cebf]">
              <p>
                <span className="font-medium text-[#e8a077]">{publishPreflight.section_count}</span>{" "}
                sections
              </p>
              <p>
                <span className="font-medium text-[#e8a077]">{publishPreflight.layout_posts}</span> posts
                from layout,{" "}
                <span className="text-[#8a7f72]">{publishPreflight.remaining_posts} additional</span>
              </p>
              <p>
                <span className="font-medium text-[#e8a077]">{publishPreflight.total_posts}</span> total
                posts ·{" "}
                <span className="font-medium text-[#e8a077]">{publishPreflight.total_media}</span> media
              </p>
              {publishPreflight.tiers.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {publishPreflight.tiers.map((t) => (
                    <span
                      key={t.tier_id}
                      className="rounded border border-[#4a3f36] px-2 py-0.5 text-[10px]"
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
                className="rounded border border-[#4a3f36] px-4 py-2 text-xs text-[#c9bfb3]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setPublishPreflight(null)}
                className="rounded bg-[#2d6a5c] px-4 py-2 text-xs text-white"
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
