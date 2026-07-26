"use client";

import { useId, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { patchAutopostDraft, type AutopostDraftWire } from "@/lib/relay-api";

type Props = {
  draft: AutopostDraftWire;
  onDraftChange: (draft: AutopostDraftWire) => void;
  onContinue: () => void;
  onDiscard: () => void;
};

export function AutopostDraftEditor({ draft, onDraftChange, onContinue, onDiscard }: Props) {
  const formId = useId();
  const titleId = `${formId}-title`;
  const bodyId = `${formId}-body`;

  const [title, setTitle] = useState(draft.title ?? "");
  const [bodyText, setBodyText] = useState(draft.body_text ?? "");
  const [busy, setBusy] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function savePatch(patch: {
    title?: string | null;
    body_text?: string | null;
    regenerate?: boolean;
    status?: string;
  }) {
    setError(null);
    const { draft: next } = await patchAutopostDraft(draft.draft_id, patch);
    onDraftChange(next);
    if (patch.title !== undefined) setTitle(next.title ?? "");
    if (patch.body_text !== undefined) setBodyText(next.body_text ?? "");
    if (patch.regenerate) {
      setTitle(next.title ?? "");
      setBodyText(next.body_text ?? "");
    }
    return next;
  }

  async function onRegenerate() {
    setRegenerating(true);
    setError(null);
    try {
      await savePatch({ regenerate: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenerating(false);
    }
  }

  async function onSaveAndContinue() {
    setBusy(true);
    setError(null);
    try {
      await savePatch({
        title: title.trim() || null,
        body_text: bodyText.trim() || null,
        status: "previewing"
      });
      onContinue();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl text-left">
      <h2 className="text-base font-semibold text-[var(--lib-fg)]">Review your draft</h2>
      <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
        Edit the copy, regenerate with AI, then choose access tiers and publish to Relay.
      </p>

      {error ? (
        <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor={titleId} className="text-[11px] font-medium text-[var(--lib-fg-muted)]">
            Title <span className="font-normal">(optional — defaults to Untitled)</span>
          </label>
          <input
            id={titleId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy || regenerating}
            className="mt-1 w-full rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 text-sm text-[var(--lib-fg)]"
            placeholder="Post title"
            maxLength={2000}
          />
        </div>
        <div>
          <label htmlFor={bodyId} className="text-[11px] font-medium text-[var(--lib-fg-muted)]">
            Body
          </label>
          <textarea
            id={bodyId}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            disabled={busy || regenerating}
            rows={8}
            className="mt-1 w-full rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 text-sm text-[var(--lib-fg)]"
            placeholder="Write your post copy…"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onRegenerate()}
          disabled={busy || regenerating}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 text-xs font-semibold text-[var(--lib-fg)] disabled:opacity-50"
        >
          {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
          Regenerate with AI
        </button>
        <button
          type="button"
          onClick={() => void onSaveAndContinue()}
          disabled={busy || regenerating}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--lib-primary)] px-4 text-xs font-semibold text-[var(--lib-primary-fg)] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Continue to publish
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy || regenerating}
          className="ml-auto text-xs text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)] disabled:opacity-50"
        >
          Discard draft
        </button>
      </div>
    </div>
  );
}
