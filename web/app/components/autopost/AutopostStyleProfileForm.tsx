"use client";

import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  fetchStyleProfilePresets,
  putCreatorStyleProfile,
  type CreatorStyleProfileWire,
  type StyleTonePresetId,
  type StyleTonePresetWire
} from "@/lib/relay-api";

type Props = {
  initialProfile: CreatorStyleProfileWire | null;
  onSaved: (profile: CreatorStyleProfileWire) => void;
};

export function AutopostStyleProfileForm({ initialProfile, onSaved }: Props) {
  const formId = useId();
  const toneId = `${formId}-tone`;
  const promptId = `${formId}-prompt`;

  const [presets, setPresets] = useState<StyleTonePresetWire[]>([]);
  const [tonePreset, setTonePreset] = useState<StyleTonePresetId>(
    initialProfile?.tone_preset ?? "friendly"
  );
  const [userPrompt, setUserPrompt] = useState(initialProfile?.user_prompt ?? "");
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { presets: rows } = await fetchStyleProfilePresets();
        if (!cancelled) setPresets(rows);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingPresets(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSample = presets.find((p) => p.id === tonePreset)?.sample ?? "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { profile } = await putCreatorStyleProfile({
        tone_preset: tonePreset,
        user_prompt: userPrompt.trim() || null
      });
      onSaved(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mx-auto max-w-xl text-left">
      <h2 className="text-base font-semibold text-[var(--lib-fg)]">Set your Style Profile</h2>
      <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
        Autopost drafts in this voice. You can change it anytime — required before your first draft.
      </p>

      {error ? (
        <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor={toneId} className="text-[11px] font-medium text-[var(--lib-fg-muted)]">
            Tone
          </label>
          <select
            id={toneId}
            value={tonePreset}
            onChange={(e) => setTonePreset(e.target.value as StyleTonePresetId)}
            disabled={busy || loadingPresets}
            className="mt-1 w-full rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 text-sm text-[var(--lib-fg)]"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {selectedSample ? (
          <blockquote className="rounded-md border border-[var(--lib-border)] bg-[var(--lib-muted)]/30 px-3 py-2 text-xs italic text-[var(--lib-fg-muted)]">
            {selectedSample}
          </blockquote>
        ) : tonePreset === "none" ? (
          <p className="text-xs text-[var(--lib-fg-muted)]">
            No AI draft — you&apos;ll write post copy manually each time.
          </p>
        ) : null}

        <div>
          <label htmlFor={promptId} className="text-[11px] font-medium text-[var(--lib-fg-muted)]">
            Your voice notes <span className="font-normal">(optional)</span>
          </label>
          <textarea
            id={promptId}
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            disabled={busy}
            rows={3}
            placeholder="e.g. casual, emoji-friendly, always thank patrons by name"
            className="mt-1 w-full rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-3 py-2 text-sm text-[var(--lib-fg)] placeholder:text-[var(--lib-fg-muted)]/70"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={busy || loadingPresets}
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--lib-primary)] px-4 text-xs font-semibold text-[var(--lib-primary-fg)] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        Save Style Profile
      </button>
    </form>
  );
}
