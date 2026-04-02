"use client";

import { useEffect, useState } from "react";
import type { Collection, LayoutMode, PageSection } from "@/lib/relay-api";

type Props = {
  section: PageSection;
  collections: Collection[];
  onUpdate: (patch: Partial<PageSection>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
};

const layoutOptions: { value: LayoutMode; label: string }[] = [
  { value: "grid", label: "Grid" },
  { value: "masonry", label: "Masonry" },
  { value: "list", label: "List" }
];

export default function SectionEditor({
  section,
  collections,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast
}: Props) {
  const sourceType = section.source.type;
  const filterSnapshot =
    section.source.type === "filter" ? JSON.stringify(section.source.query) : "";
  const [filterDraft, setFilterDraft] = useState<string>(() =>
    section.source.type === "filter" ? JSON.stringify(section.source.query, null, 2) : "{}"
  );

  useEffect(() => {
    if (section.source.type === "filter") {
      setFilterDraft(JSON.stringify(section.source.query, null, 2));
    }
    /* filterSnapshot serializes query; omitting section.source.query avoids reset on every parent render */
  }, [section.section_id, filterSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps -- sync keyed by filterSnapshot

  return (
    <div
      className="p-3 border border-[#3d342b] rounded bg-[#1a1410] space-y-3 scroll-mt-4 ring-offset-[#161210] motion-safe:transition-shadow"
      data-section-id={section.section_id}
      {...(section.source.type === "collection"
        ? { "data-designer-collection": section.source.collection_id }
        : {})}
    >
      <div className="flex items-center justify-between">
        <input
          value={section.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          className="bg-transparent border-b border-[#4a3f36] text-sm text-[#f0e6d8] font-[family-name:var(--font-display)] focus:outline-none focus:border-[#e8a077]"
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className="text-[10px] px-1 text-[#8a7f72] hover:text-[#f0e6d8] disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            className="text-[10px] px-1 text-[#8a7f72] hover:text-[#f0e6d8] disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="text-[10px] px-1 text-[#8a7f72] hover:text-red-400"
          >
            ×
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-1">Source</p>
          <select
            value={sourceType}
            onChange={(e) => {
              const t = e.target.value;
              if (t === "collection") {
                onUpdate({ source: { type: "collection", collection_id: collections[0]?.collection_id ?? "" } });
              } else if (t === "manual") {
                onUpdate({ source: { type: "manual", post_ids: [] } });
              } else {
                onUpdate({ source: { type: "filter", query: {} } });
              }
            }}
            className="w-full bg-[#2a221c] border border-[#4a3f36] px-2 py-1 rounded text-xs text-[#ede5da]"
          >
            <option value="collection">Collection</option>
            <option value="manual">Manual</option>
            <option value="filter">Filter</option>
          </select>
        </div>

        {sourceType === "collection" ? (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-1">Collection</p>
            <select
              value={section.source.type === "collection" ? section.source.collection_id : ""}
              onChange={(e) => onUpdate({ source: { type: "collection", collection_id: e.target.value } })}
              className="w-full bg-[#2a221c] border border-[#4a3f36] px-2 py-1 rounded text-xs text-[#ede5da]"
            >
              {collections.map((c) => (
                <option key={c.collection_id} value={c.collection_id}>{c.title}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {sourceType === "filter" && section.source.type === "filter" ? (
        <div className="space-y-1.5">
          <p className="text-[10px] leading-relaxed text-[#8a7f72]">
            Same keys as the gallery list API (
            <code className="text-[#b8a995]">q</code>,{" "}
            <code className="text-[#b8a995]">tag_ids</code>, <code className="text-[#b8a995]">tier_ids</code>,{" "}
            <code className="text-[#b8a995]">visibility</code>, <code className="text-[#b8a995]">sort</code>, dates,{" "}
            <code className="text-[#b8a995]">media_type</code>). Empty {`{}`} → up to 200 items.
          </p>
          <textarea
            value={filterDraft}
            onChange={(e) => setFilterDraft(e.target.value)}
            onBlur={() => {
              try {
                const parsed = JSON.parse(filterDraft) as unknown;
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                  onUpdate({ source: { type: "filter", query: parsed as Record<string, unknown> } });
                }
              } catch {
                if (section.source.type === "filter") {
                  setFilterDraft(JSON.stringify(section.source.query, null, 2));
                }
              }
            }}
            spellCheck={false}
            rows={5}
            className="w-full resize-y rounded border border-[#4a3f36] bg-[#0d0a08] p-2 font-mono text-[10px] leading-snug text-[#c9bfb3] focus:border-[#e8a077] focus:outline-none"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-1">Layout</p>
          <select
            value={section.layout}
            onChange={(e) => onUpdate({ layout: e.target.value as LayoutMode })}
            className="w-full bg-[#2a221c] border border-[#4a3f36] px-2 py-1 rounded text-xs text-[#ede5da]"
          >
            {layoutOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-1">Columns</p>
          <input
            type="number"
            min={2}
            max={6}
            value={section.columns ?? 3}
            onChange={(e) => onUpdate({ columns: Number(e.target.value) })}
            className="w-full bg-[#2a221c] border border-[#4a3f36] px-2 py-1 rounded text-xs text-[#ede5da]"
          />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#b8a995] mb-1">Max items</p>
          <input
            type="number"
            min={1}
            value={section.max_items ?? ""}
            onChange={(e) => onUpdate({ max_items: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="∞"
            className="w-full bg-[#2a221c] border border-[#4a3f36] px-2 py-1 rounded text-xs text-[#ede5da]"
          />
        </div>
      </div>
    </div>
  );
}
