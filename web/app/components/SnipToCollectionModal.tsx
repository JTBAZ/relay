"use client";

import { useEffect, useState } from "react";
import {
  addPatronCollectionEntry,
  createPatronCollection,
  listPatronCollections,
  type PatronCollectionWithEntries
} from "@/lib/relay-api";
import SnipIcon from "@/app/components/icons/SnipIcon";

type Props = {
  open: boolean;
  creatorId: string;
  postId: string;
  mediaId: string;
  collections: PatronCollectionWithEntries[];
  onClose: () => void;
  onApplied: (collections: PatronCollectionWithEntries[]) => void;
};

export default function SnipToCollectionModal({
  open,
  creatorId,
  postId,
  mediaId,
  collections,
  onClose,
  onApplied
}: Props) {
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setErr(null);
      setNewTitle("");
    }
  }, [open]);

  if (!open) return null;

  const sorted = [...collections].sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title));

  const alreadyIn = (c: PatronCollectionWithEntries) =>
    c.entries.some((e) => e.media_id === mediaId && e.post_id === postId);

  const pick = async (collectionId: string) => {
    setBusy(true);
    setErr(null);
    try {
      await addPatronCollectionEntry({ creatorId, collectionId, postId, mediaId });
      const fresh = await listPatronCollections(creatorId);
      onApplied(fresh);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const createAndSnip = async () => {
    const t = newTitle.trim();
    if (!t) return;
    setBusy(true);
    setErr(null);
    try {
      const col = await createPatronCollection({ creatorId, title: t });
      await addPatronCollectionEntry({
        creatorId,
        collectionId: col.collection_id,
        postId,
        mediaId
      });
      const fresh = await listPatronCollections(creatorId);
      onApplied(fresh);
      setNewTitle("");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal
      aria-label="Snip to collection"
      onClick={onClose}
    >
      <div
        className="max-h-[min(85vh,520px)] w-full max-w-md overflow-hidden rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--lib-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <SnipIcon className="h-5 w-5 text-[oklch(0.48_0.08_155)]" />
            <h2 className="text-sm font-semibold text-[var(--lib-fg)]">Snip to collection</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-[var(--lib-fg-muted)] hover:bg-[var(--lib-muted)] hover:text-[var(--lib-fg)]"
          >
            Close
          </button>
        </div>
        <div className="max-h-[min(60vh,400px)] overflow-y-auto px-4 py-3">
          {err ? <p className="mb-2 text-xs text-[var(--lib-warning)]">{err}</p> : null}
          <ul className="space-y-1.5">
            {sorted.map((c) => {
              const inCol = alreadyIn(c);
              return (
                <li key={c.collection_id}>
                  <button
                    type="button"
                    disabled={busy || inCol}
                    onClick={() => void pick(c.collection_id)}
                    className="flex w-full items-center justify-between rounded-lg border border-[var(--lib-border)] bg-[var(--lib-muted)] px-3 py-2 text-left text-sm text-[var(--lib-fg)] transition hover:border-[color-mix(in_srgb,var(--lib-selection)_40%,var(--lib-border))] disabled:cursor-default disabled:opacity-50"
                  >
                    <span className="truncate font-medium">{c.title}</span>
                    {inCol ? (
                      <span className="shrink-0 text-[10px] text-[var(--lib-fg-muted)]">Added</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {sorted.length === 0 ? (
            <p className="py-2 text-xs text-[var(--lib-fg-muted)]">No collections yet — create one below.</p>
          ) : null}
        </div>
        <div className="border-t border-[var(--lib-border)] bg-[color-mix(in_srgb,var(--lib-muted)_40%,var(--lib-card))] px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--lib-fg-muted)]">
            New collection
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Collection name"
              className="min-w-0 flex-1 rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-2.5 py-2 text-sm text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)] focus:border-[color-mix(in_srgb,var(--lib-selection)_45%,var(--lib-border))] focus:outline-none focus:ring-1 focus:ring-[color-mix(in_srgb,var(--lib-selection)_35%,transparent)]"
              onKeyDown={(e) => {
                if (e.key === "Enter") void createAndSnip();
              }}
            />
            <button
              type="button"
              disabled={busy || !newTitle.trim()}
              onClick={() => void createAndSnip()}
              className="shrink-0 rounded-md border border-[color-mix(in_srgb,var(--lib-selection)_45%,var(--lib-border))] bg-[color-mix(in_srgb,var(--lib-selection)_12%,var(--lib-muted))] px-3 py-2 text-xs font-medium text-[var(--lib-fg)] disabled:opacity-50"
            >
              Create & snip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
