"use client";

import { useCallback, useEffect, useState } from "react";
import { RELAY_API_BASE, relayFetch, type Collection } from "@/lib/relay-api";
import CollectionEditor from "./CollectionEditor";

type Props = {
  creatorId: string;
  activeCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  selectedPostIds: string[];
  onCollectionChange: () => void;
};

export default function CollectionsPanel({
  creatorId,
  activeCollectionId,
  onSelectCollection,
  selectedPostIds,
  onCollectionChange
}: Props) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [showEditor, setShowEditor] = useState(false);

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
  }, [loadCollections]);

  const createCollection = async (title: string, description: string) => {
    await fetch(`${RELAY_API_BASE}/api/v1/gallery/collections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creator_id: creatorId, title, description: description || undefined })
    });
    setShowEditor(false);
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

  const addSelectedToCollection = async (collectionId: string) => {
    if (selectedPostIds.length === 0) return;
    await fetch(`${RELAY_API_BASE}/api/v1/gallery/collections/${collectionId}/posts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ post_ids: selectedPostIds })
    });
    await loadCollections();
    onCollectionChange();
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-[family-name:var(--font-display)] text-lg text-[#f0e6d8]">
          Collections
        </h3>
        <button
          type="button"
          onClick={() => setShowEditor(true)}
          className="text-xs px-2 py-0.5 rounded bg-[#4a3728] hover:bg-[#5c4a38] text-[#ede5da]"
        >
          + New
        </button>
      </div>

      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
        <button
          type="button"
          onClick={() => onSelectCollection(null)}
          className={`text-left text-xs truncate px-2 py-1 rounded ${
            activeCollectionId === null
              ? "bg-[#2a221c] text-[#f0e6d8]"
              : "text-[#c9bfb3] hover:text-[#f0e6d8]"
          }`}
        >
          All Posts
        </button>
        {collections.map((col) => (
          <div key={col.collection_id} className="flex items-center gap-1 group">
            <button
              type="button"
              onClick={() => onSelectCollection(col.collection_id)}
              className={`flex-1 text-left text-xs truncate px-2 py-1 rounded ${
                activeCollectionId === col.collection_id
                  ? "bg-[#2a221c] text-[#f0e6d8]"
                  : "text-[#c9bfb3] hover:text-[#f0e6d8]"
              }`}
            >
              {col.title}
              <span className="ml-1 text-[#8a7f72]">({col.post_ids.length})</span>
            </button>
            <button
              type="button"
              onClick={() => void deleteCollection(col.collection_id)}
              className="text-[10px] text-[#8a7f72] hover:text-red-400 opacity-0 group-hover:opacity-100 px-1"
              title="Delete collection"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {selectedPostIds.length > 0 && collections.length > 0 ? (
        <div className="pt-1">
          <p className="text-[10px] text-[#8a7f72] mb-1">Add {selectedPostIds.length} selected to:</p>
          <div className="flex flex-wrap gap-1">
            {collections.map((col) => (
              <button
                key={col.collection_id}
                type="button"
                onClick={() => void addSelectedToCollection(col.collection_id)}
                className="text-[10px] px-2 py-0.5 rounded border border-[#4a3f36] text-[#c9bfb3] hover:border-[#e8a077] hover:text-[#e8a077]"
              >
                {col.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {showEditor ? (
        <CollectionEditor
          onSave={(title, desc) => void createCollection(title, desc)}
          onCancel={() => setShowEditor(false)}
        />
      ) : null}
    </section>
  );
}
