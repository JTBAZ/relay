"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  fetchCreatorPublicSlug,
  patchCreatorPublicSlug
} from "@/lib/relay-api";

export function CreatorPublicUrlSettings() {
  const [slug, setSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetchCreatorPublicSlug();
      setSlug(r.public_slug);
      setDraft(r.public_slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    const next = draft.trim().toLowerCase();
    if (!next || next === slug) {
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const r = await patchCreatorPublicSlug(next);
      setSlug(r.public_slug);
      setDraft(r.public_slug);
      setSaved("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-3 text-sm text-[var(--lib-fg-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading your public URL…
      </div>
    );
  }

  const href =
    slug && typeof window !== "undefined"
      ? `${window.location.origin}/patron/c/${encodeURIComponent(slug)}`
      : null;
  const pathPrefix =
    typeof window !== "undefined" ? `${window.location.host}/patron/c/` : "/patron/c/";

  return (
    <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-4">
      <h2 className="text-sm font-semibold text-[var(--lib-fg)]">Public profile URL</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--lib-fg-muted)]">
        A default slug is created from your email when you sign up. You can change it here; only lowercase letters,
        numbers, and hyphens (3–32 characters).
      </p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#2D6A4F] hover:text-[#40916C]"
        >
          {href.replace(/^https?:\/\//, "")}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="shrink-0 text-xs text-[var(--lib-fg-muted)] sm:pt-2">{pathPrefix}</span>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-2 text-sm text-[var(--lib-fg)] outline-none ring-[#2D6A4F]/30 focus:ring-2"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Public URL slug"
        />
        <button
          type="button"
          disabled={saving || draft.trim().toLowerCase() === (slug ?? "")}
          onClick={() => void onSave()}
          className="shrink-0 rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#40916C] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      {saved && !error ? <p className="mt-2 text-xs text-[#40916C]">{saved}</p> : null}
    </div>
  );
}
