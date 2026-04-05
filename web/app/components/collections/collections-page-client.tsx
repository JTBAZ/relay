"use client";

import { useState } from "react";
import { RelayNav } from "./relay-nav";
import { CollectionsBrowser } from "./collections-browser";
import { CollectionEditorRail } from "./collection-editor-rail";
import { CollectFromSubscriptions } from "./collect-from-subscriptions";
import type { Collection } from "@/lib/collections-data";

type View = "index" | "collect";

export function CollectionsPageClient() {
  const [view, setView] = useState<View>("index");
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);

  if (view === "collect") {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0A]">
        <RelayNav />
        <div className="min-h-0 flex-1 overflow-hidden">
          <CollectFromSubscriptions onBack={() => setView("index")} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0A]">
      <RelayNav />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden transition-all duration-300">
          <CollectionsBrowser
            selectedId={selectedCollection?.id ?? null}
            onSelect={(col) => setSelectedCollection((prev) => (prev?.id === col.id ? null : col))}
            onNewShelf={() => setView("collect")}
          />
        </div>

        {selectedCollection && (
          <div className="h-full w-80 shrink-0 overflow-hidden border-l border-[#2A2A2A] xl:w-96">
            <CollectionEditorRail
              key={selectedCollection.id}
              collection={selectedCollection}
              onClose={() => setSelectedCollection(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
