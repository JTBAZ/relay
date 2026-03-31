"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [creatorId] = useState(defaultCreatorId);
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishPreflight, setPublishPreflight] = useState<PublishPreflight | null>(null);
  const [publishing, setPublishing] = useState(false);

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
      // Fall back to a default empty layout so the UI isn't stuck
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
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-[#8a7f72]">
        <p>Loading designer…</p>
        <p className="text-[10px]">Make sure the API server is running and rebuilt (<code className="text-[#ede5da]">npm run build &amp;&amp; npm start</code>)</p>
      </div>
    );
  }

  const sortedSections = [...layout.sections].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="min-h-screen bg-[#100c0a] text-[#ede5da]">
      <div className="border-b border-[#3d342b] px-6 py-3 flex items-center justify-between bg-[#1a1410]/90 backdrop-blur sticky top-0 z-20">
        <h2 className="font-[family-name:var(--font-display)] text-lg">Page Designer</h2>
        <div className="flex items-center gap-3">
          {dirty ? (
            <span className="text-[10px] text-[#e8a077]">Unsaved changes</span>
          ) : null}
          <button
            type="button"
            onClick={() => void saveLayout()}
            disabled={saving || !dirty}
            className="text-xs px-4 py-1.5 rounded bg-[#8b3a1a] text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Layout"}
          </button>
          <button
            type="button"
            onClick={() => void runPublishPreflight()}
            disabled={publishing || dirty}
            className="text-xs px-4 py-1.5 rounded bg-[#2d6a5c] text-white disabled:opacity-50"
            title={dirty ? "Save layout first" : "Publish to patron site"}
          >
            {publishing ? "Preparing…" : "Publish"}
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="mx-4 mt-2 px-3 py-2 rounded border border-[#8b3a1a] bg-[#2a1810] text-sm text-[#f0c4b8]">
          <strong className="block text-xs uppercase tracking-wide text-[#e8a077] mb-1">
            Failed to load layout from API
          </strong>
          {loadError}
          <p className="mt-1 text-[10px] text-[#b8a995]">
            Using default empty layout. Run <code className="text-[#ede5da]">npm run build &amp;&amp; npm start</code> to rebuild the API server.
          </p>
        </div>
      ) : null}

      <div className="grid lg:grid-cols-[380px_1fr] gap-0 min-h-[calc(100vh-52px)]">
        <aside className="border-r border-[#3d342b] p-4 space-y-6 bg-[#161210] overflow-y-auto">
          <section>
            <h3 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8] mb-3">
              Theme
            </h3>
            <ThemePicker
              colorScheme={layout.theme.color_scheme}
              accentColor={layout.theme.accent_color}
              onChange={(scheme, accent) =>
                updateLayout({ theme: { color_scheme: scheme, accent_color: accent } })
              }
            />
          </section>

          <section>
            <h3 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8] mb-3">
              Hero
            </h3>
            <HeroEditor
              hero={layout.hero}
              onChange={(hero) => updateLayout({ hero })}
            />
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8]">
                Sections
              </h3>
              <button
                type="button"
                onClick={() => void addSection()}
                className="text-xs px-2 py-0.5 rounded bg-[#4a3728] hover:bg-[#5c4a38] text-[#ede5da]"
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
              <p className="text-xs text-[#8a7f72]">No sections yet. Add one to get started.</p>
            ) : null}
          </section>
        </aside>

        <main className="p-6 overflow-auto">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-3">Live Preview</p>
          <LayoutPreview
            layout={layout}
            creatorId={creatorId}
            collections={collections}
          />
        </main>
      </div>

      {publishPreflight ? (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          role="dialog"
          aria-modal
          onClick={() => setPublishPreflight(null)}
        >
          <div
            className="bg-[#1a1410] border border-[#3d342b] rounded-lg p-6 max-w-md w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8]">
              Publish Preflight
            </h3>
            <div className="space-y-2 text-sm text-[#d8cebf]">
              <p>
                <span className="text-[#e8a077] font-medium">{publishPreflight.section_count}</span> sections
              </p>
              <p>
                <span className="text-[#e8a077] font-medium">{publishPreflight.layout_posts}</span> posts from layout,{" "}
                <span className="text-[#8a7f72]">{publishPreflight.remaining_posts} additional</span>
              </p>
              <p>
                <span className="text-[#e8a077] font-medium">{publishPreflight.total_posts}</span> total posts ·{" "}
                <span className="text-[#e8a077] font-medium">{publishPreflight.total_media}</span> media
              </p>
              {publishPreflight.tiers.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-2">
                  {publishPreflight.tiers.map((t) => (
                    <span key={t.tier_id} className="text-[10px] px-2 py-0.5 rounded border border-[#4a3f36]">
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
                className="text-xs px-4 py-2 rounded border border-[#4a3f36] text-[#c9bfb3]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setPublishPreflight(null)}
                className="text-xs px-4 py-2 rounded bg-[#2d6a5c] text-white"
              >
                Confirm &amp; Publish
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
