"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import {
  addPatronCollectionEntry,
  createPatronCollection,
  listPatronCollections,
  type PatronCollectionWithEntries
} from "@/lib/relay-api";
import { emitRelayInteractionTelemetryEvent } from "@/lib/relay-interaction-telemetry";

export type SnipTarget = {
  creatorId: string;
  postId: string;
  mediaId: string;
  title: string;
  previewUrl?: string;
};

type SnipToCollectionDialogProps = {
  open: boolean;
  target: SnipTarget | null;
  onClose: () => void;
  onSnipped?: (collectionId: string) => void;
};

export function SnipToCollectionDialog({
  open,
  target,
  onClose,
  onSnipped
}: SnipToCollectionDialogProps) {
  const [collections, setCollections] = useState<PatronCollectionWithEntries[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [successCollectionId, setSuccessCollectionId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !target) return;
    let cancelled = false;
    setPhase("loading");
    setError(null);
    setSuccessCollectionId(null);
    setSelectedCollectionId(null);
    void listPatronCollections(target.creatorId)
      .then((rows) => {
        if (cancelled) return;
        setCollections(rows);
        setSelectedCollectionId(rows[0]?.collection_id ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load collections.");
      })
      .finally(() => {
        if (!cancelled) setPhase("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [open, target]);

  const selectedCollection = useMemo(
    () => collections.find((c) => c.collection_id === selectedCollectionId) ?? null,
    [collections, selectedCollectionId]
  );
  const selectedAlreadyContainsTarget = Boolean(
    selectedCollection?.entries.some((entry) => entry.media_id === target?.mediaId)
  );

  if (!open || !target) return null;

  async function createCollectionFromInput(): Promise<PatronCollectionWithEntries | null> {
    const title = newTitle.trim();
    if (!title || !target) return null;
    const created = await createPatronCollection({ creatorId: target.creatorId, title });
    const withEntries: PatronCollectionWithEntries = { ...created, entries: [] };
    setCollections((rows) => [...rows, withEntries]);
    setSelectedCollectionId(created.collection_id);
    setNewTitle("");
    return withEntries;
  }

  async function handleCreateCollection() {
    if (!target || phase === "saving" || !newTitle.trim()) return;
    setPhase("saving");
    setError(null);
    try {
      await createCollectionFromInput();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create collection.");
    } finally {
      setPhase("idle");
    }
  }

  async function handleSave() {
    if (!target || !selectedCollectionId || phase === "saving") return;
    setPhase("saving");
    setError(null);
    try {
      const entry = await addPatronCollectionEntry({
        creatorId: target.creatorId,
        collectionId: selectedCollectionId,
        postId: target.postId,
        mediaId: target.mediaId
      });
      emitRelayInteractionTelemetryEvent({
        event_name: "snip_created",
        surface: "post_detail_snip_dialog",
        creator_id: target.creatorId,
        post_id: target.postId,
        media_id: target.mediaId,
        collection_id: selectedCollectionId
      });
      setCollections((rows) =>
        rows.map((collection) =>
          collection.collection_id === selectedCollectionId &&
          !collection.entries.some((existing) => existing.media_id === entry.media_id)
            ? { ...collection, entries: [entry, ...collection.entries] }
            : collection
        )
      );
      setSuccessCollectionId(selectedCollectionId);
      onSnipped?.(selectedCollectionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this snip.");
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase === "loading" || phase === "saving";

  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center px-4 animate-[fadeIn_0.2s_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label="Add snip to collection"
    >
      <div className="absolute inset-0 bg-black/80" onClick={busy ? undefined : onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#1A1A1A] bg-[#0E0E0E] shadow-2xl animate-[scaleIn_0.2s_ease-out]">
        <div className="flex items-center justify-between border-b border-[#1A1A1A] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#E0E0E0]">Add to collection</h2>
            <p className="mt-0.5 text-xs text-[#555555]">Snipping one media item from this post.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-[#555555] transition-colors hover:text-[#C8C8C8] disabled:opacity-50"
            aria-label="Close snip dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex gap-3 rounded-lg border border-[#1A1A1A] bg-[#0A0A0A] p-3">
            {target.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Relay media URL
              <img
                src={target.previewUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-md object-cover"
                width={64}
                height={64}
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-[#161616] text-[10px] uppercase text-[#555555]">
                Media
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[#E0E0E0]">{target.title}</p>
              <p className="mt-1 font-mono text-[10px] text-[#555555]">{target.mediaId}</p>
            </div>
          </div>

          <div className="space-y-2">
            {phase === "loading" ? (
              <div className="flex items-center justify-center rounded-lg border border-[#1A1A1A] py-8 text-xs text-[#555555]">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Loading collections...
              </div>
            ) : collections.length > 0 ? (
              collections.map((collection) => {
                const active = selectedCollectionId === collection.collection_id;
                const hasSnip = collection.entries.some((entry) => entry.media_id === target.mediaId);
                return (
                  <button
                    key={collection.collection_id}
                    type="button"
                    onClick={() => setSelectedCollectionId(collection.collection_id)}
                    className={[
                      "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-[#2D6A4F] bg-[#0D1F17] text-[#E0E0E0]"
                        : "border-[#1A1A1A] bg-[#111111] text-[#888888] hover:border-[#2A2A2A] hover:text-[#C8C8C8]"
                    ].join(" ")}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{collection.title}</span>
                      <span className="mt-0.5 block text-[11px] text-[#555555]">
                        {collection.entries.length} snip{collection.entries.length === 1 ? "" : "s"}
                        {hasSnip ? " · already added" : ""}
                      </span>
                    </span>
                    {active ? <Check className="h-4 w-4 shrink-0 text-[#40916C]" aria-hidden="true" /> : null}
                  </button>
                );
              })
            ) : (
              <div className="rounded-lg border border-dashed border-[#242424] px-4 py-6 text-center">
                <p className="text-sm text-[#888888]">No collections yet</p>
                <p className="mt-1 text-xs text-[#555555]">Create one below to save this snip.</p>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-[#1A1A1A] bg-[#0A0A0A] p-3">
            <label htmlFor="new-snip-collection" className="text-xs font-medium text-[#888888]">
              Create new collection
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="new-snip-collection"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Collection name"
                className="min-w-0 flex-1 rounded-md border border-[#242424] bg-[#141414] px-3 py-2 text-sm text-[#E0E0E0] placeholder:text-[#444444] focus:border-[#2D6A4F] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleCreateCollection()}
                disabled={busy || !newTitle.trim()}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#2A2A2A] px-3 py-2 text-xs text-[#888888] transition-colors hover:border-[#2D6A4F]/50 hover:text-[#40916C] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Create
              </button>
            </div>
          </div>

          {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
          {successCollectionId ? (
            <p className="mt-3 text-xs text-[#40916C]">Snip added to collection.</p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#1A1A1A] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-xs text-[#555555] transition-colors hover:text-[#888888] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy || !selectedCollectionId || selectedAlreadyContainsTarget}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#40916C] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "saving" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {selectedAlreadyContainsTarget ? "Already snipped" : "Add snip"}
          </button>
        </div>
      </div>
    </div>
  );
}
