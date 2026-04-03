"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RELAY_API_BASE, relayFetch, type Collection } from "@/lib/relay-api";
import CollectionEditor from "./CollectionEditor";

type Props = {
  creatorId: string;
  activeCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  onCollectionChange: () => void;
  /** Increment to force reload from API (e.g. after creating a collection elsewhere). */
  reloadToken?: number;
  collectionEditorOpen: boolean;
  onCollectionEditorOpenChange: (open: boolean) => void;
  /** When false, hide the collection list (editor still mounts when open). */
  showList?: boolean;
};

export default function CollectionsPanel({
  creatorId,
  activeCollectionId,
  onSelectCollection,
  onCollectionChange,
  reloadToken = 0,
  collectionEditorOpen,
  onCollectionEditorOpenChange,
  showList = true
}: Props) {
  const [collections, setCollections] = useState<Collection[]>([]);

  const loadCollections = useCallback(async () => {
    const u = new URLSearchParams();
    u.set("creator_id", creatorId);
    const res = await relayFetch<{ items: Collection[] }>(
      `/api/v1/gallery/collections?${u}`
    );
    setCollections(res.items);
  }, [creatorId]);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections, reloadToken]);

  const createCollection = async (title: string, description: string) => {
    await fetch(`${RELAY_API_BASE}/api/v1/gallery/collections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creator_id: creatorId, title, description: description || undefined })
    });
    onCollectionEditorOpenChange(false);
    await loadCollections();
  };

  const deleteCollection = async (collectionId: string) => {
    await fetch(`${RELAY_API_BASE}/api/v1/gallery/collections/${collectionId}`, {
      method: "DELETE"
    });
    if (activeCollectionId === collectionId) onSelectCollection(null);
    await loadCollections();
    onCollectionChange();
  };

  const pickCollection = (id: string) => {
    onSelectCollection(activeCollectionId === id ? null : id);
  };

  return (
    <section className="space-y-2">
      {showList ? (
        <>
          <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {collections.map((col) => (
              <div key={col.collection_id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => pickCollection(col.collection_id)}
                  className={`min-w-0 flex-1 truncate rounded-r-md py-1.5 pl-2.5 pr-1 text-left text-xs transition-colors ${
                    activeCollectionId === col.collection_id
                      ? "border-l-2 border-l-[var(--lib-primary)] bg-[var(--lib-sidebar-accent)] text-[var(--lib-fg)]"
                      : "border-l-2 border-l-transparent text-[var(--lib-fg-muted)] hover:bg-[var(--lib-sidebar-accent)]/50 hover:text-[var(--lib-fg)]"
                  }`}
                >
                  <span className="truncate">{col.title}</span>
                </button>
                <span className="shrink-0 tabular-nums pr-1 text-[10px] text-[var(--lib-fg-muted)]">
                  {col.post_ids.length}
                </span>
                <Link
                  href={`/designer?highlight=collection:${encodeURIComponent(col.collection_id)}`}
                  className="px-0.5 text-[10px] text-[var(--lib-fg-muted)] opacity-0 hover:text-[var(--lib-primary)] group-hover:opacity-100"
                  title="Designer"
                >
                  Page
                </Link>
                <button
                  type="button"
                  onClick={() => void deleteCollection(col.collection_id)}
                  className="px-1 text-[10px] text-[var(--lib-fg-muted)] opacity-0 hover:text-red-400 group-hover:opacity-100"
                  title="Delete"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {collectionEditorOpen ? (
        <CollectionEditor
          onSave={(title, desc) => void createCollection(title, desc)}
          onCancel={() => onCollectionEditorOpenChange(false)}
        />
      ) : null}
    </section>
  );
}
