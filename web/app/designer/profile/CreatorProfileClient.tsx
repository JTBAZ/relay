"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import {
  getCreatorProfile,
  patchCreatorProfile,
  RelayApiError,
  type CreatorProfileIdentity,
  type CreatorProfileIdentityPatch,
} from "@/lib/relay-api";
import { getWebAppOrigin } from "@/lib/site-origin";

const BIO_LIMIT = 280;
const DISPLAY_NAME_LIMIT = 120;
const DISCIPLINE_LIMIT = 120;
const URL_LIMIT = 2048;

type FormState = {
  display_name: string;
  username: string;
  avatar_url: string;
  banner_url: string;
  bio: string;
  discipline: string;
};

const EMPTY_FORM: FormState = {
  display_name: "",
  username: "",
  avatar_url: "",
  banner_url: "",
  bio: "",
  discipline: "",
};

function identityToForm(identity: CreatorProfileIdentity): FormState {
  return {
    display_name: identity.display_name ?? "",
    username: identity.username ?? "",
    avatar_url: identity.avatar_url ?? "",
    banner_url: identity.banner_url ?? "",
    bio: identity.bio ?? "",
    discipline: identity.discipline ?? "",
  };
}

function buildPatch(
  current: FormState,
  baseline: FormState
): CreatorProfileIdentityPatch {
  const patch: CreatorProfileIdentityPatch = {};
  (Object.keys(current) as Array<keyof FormState>).forEach((key) => {
    if (current[key].trim() === baseline[key].trim()) return;
    const trimmed = current[key].trim();
    patch[key] = trimmed.length === 0 ? null : trimmed;
  });
  return patch;
}

export default function CreatorProfileClient() {
  const [identity, setIdentity] = useState<CreatorProfileIdentity | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const prof = await getCreatorProfile();
      setIdentity(prof);
      const next = identityToForm(prof);
      setForm(next);
      setBaseline(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(
    <K extends keyof FormState>(key: K, value: string) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setSavedNote(null);
    },
    []
  );

  const sanitizedUsername = useMemo(
    () => form.username.toLowerCase().replace(/[^a-z0-9_]/g, ""),
    [form.username]
  );
  const usernameDirty = form.username.trim() !== baseline.username.trim();
  const usernameTooShort =
    usernameDirty && sanitizedUsername.length > 0 && sanitizedUsername.length < 3;

  const bioOver = form.bio.length > BIO_LIMIT;
  const displayOver = form.display_name.length > DISPLAY_NAME_LIMIT;
  const disciplineOver = form.discipline.length > DISCIPLINE_LIMIT;
  const avatarOver = form.avatar_url.length > URL_LIMIT;
  const bannerOver = form.banner_url.length > URL_LIMIT;
  const hasClientError =
    bioOver ||
    displayOver ||
    disciplineOver ||
    avatarOver ||
    bannerOver ||
    usernameTooShort;

  const patch = useMemo(() => buildPatch(form, baseline), [form, baseline]);
  const isDirty = Object.keys(patch).length > 0;

  const onSave = async () => {
    if (!isDirty || hasClientError) return;
    setSaving(true);
    setError(null);
    setSavedNote(null);
    try {
      const next = await patchCreatorProfile(patch);
      setIdentity(next);
      const refreshed = identityToForm(next);
      setForm(refreshed);
      setBaseline(refreshed);
      setSavedNote("Saved.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const publicUrl = useMemo(() => {
    if (!identity?.public_slug) return null;
    if (typeof window === "undefined") {
      return `/patron/c/${encodeURIComponent(identity.public_slug)}`;
    }
    const o = getWebAppOrigin() || window.location.origin;
    return `${o}/patron/c/${encodeURIComponent(identity.public_slug)}`;
  }, [identity]);

  const urlSlugDiffersFromUsername = useMemo(() => {
    if (!identity?.username_norm?.trim() || !identity.public_slug) return false;
    const s = identity.username_norm
      .trim()
      .replace(/_/g, "-")
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (s.length < 3 || s.length > 32) return false;
    return s !== identity.public_slug;
  }, [identity?.public_slug, identity?.username_norm]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--lib-bg)] text-sm text-[var(--lib-fg-muted)]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        Loading your profile…
      </div>
    );
  }

  if (error && !identity) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-[var(--lib-bg)] px-6 py-10 text-sm text-[var(--lib-fg-muted)]">
        <p role="alert" className="max-w-md text-center text-red-400">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[var(--lib-border)] px-4 py-2 text-xs font-medium text-[var(--lib-fg)] hover:border-[#2D6A4F]"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <main
      aria-labelledby="creator-profile-heading"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6"
    >
      <header className="flex flex-col gap-1">
        <h1
          id="creator-profile-heading"
          className="text-xl font-semibold text-[var(--lib-fg)]"
        >
          Profile
        </h1>
        <p className="text-sm text-[var(--lib-fg-muted)]">
          How you appear to patrons across Relay — feed cards, sidebar, and your public page.
        </p>
        {publicUrl ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[#2D6A4F] hover:text-[#40916C]"
          >
            View public page: {publicUrl.replace(/^https?:\/\//, "")}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
        {urlSlugDiffersFromUsername ? (
          <p className="mt-2 max-w-lg text-xs text-[var(--lib-fg-muted)]">
            Your public gallery URL uses a different slug than your @username (URLs use hyphens; handles
            may use underscores).{" "}
            <Link
              href="/action-center"
              className="font-medium text-[#2D6A4F] underline-offset-4 hover:text-[#40916C] hover:underline"
            >
              Edit public URL in Action Center
            </Link>
            .
          </p>
        ) : null}
      </header>

      {/* Identity */}
      <section className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-4">
        <h2 className="text-sm font-semibold text-[var(--lib-fg)]">Identity</h2>
        <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
          Your handle (`@username`) and the display name shown on cards.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--lib-fg-muted)]">
              Display name
            </span>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => update("display_name", e.target.value)}
              placeholder="Your studio or artist name"
              className="rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-2 text-sm text-[var(--lib-fg)] outline-none ring-[#2D6A4F]/30 focus:ring-2"
              maxLength={DISPLAY_NAME_LIMIT + 1}
              aria-invalid={displayOver || undefined}
              aria-label="Display name"
            />
            {displayOver ? (
              <span className="text-[11px] text-red-400">
                Display name must be at most {DISPLAY_NAME_LIMIT} characters.
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--lib-fg-muted)]">
              Username
            </span>
            <div className="flex items-stretch overflow-hidden rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] focus-within:ring-2 focus-within:ring-[#2D6A4F]/30">
              <span className="select-none border-r border-[var(--lib-border)] bg-[var(--lib-card)] px-3 py-2 text-sm text-[var(--lib-fg-muted)]">
                @
              </span>
              <input
                type="text"
                value={form.username}
                onChange={(e) => update("username", e.target.value)}
                placeholder="cool_artist_42"
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-[var(--lib-fg)] focus:outline-none"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label="Username"
              />
            </div>
            {sanitizedUsername && sanitizedUsername !== form.username.toLowerCase() ? (
              <span className="text-[11px] text-[var(--lib-fg-muted)]">
                Will be saved as{" "}
                <span className="text-[#40916C]">@{sanitizedUsername}</span>{" "}
                (lowercase letters, numbers, underscores only).
              </span>
            ) : null}
            {usernameTooShort ? (
              <span className="text-[11px] text-red-400">
                Username must be 3–32 characters after normalization.
              </span>
            ) : null}
          </label>
        </div>
      </section>

      {/* Visuals */}
      <section className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-4">
        <h2 className="text-sm font-semibold text-[var(--lib-fg)]">Avatar &amp; banner</h2>
        <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
          Paste a URL for now — file upload is coming soon. We pre-fill from your Patreon
          campaign image when available; clear a field to fall back to the Patreon photo on
          your next visit.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-[var(--lib-fg-muted)]">Avatar</span>
            <div className="flex items-center gap-3">
              {form.avatar_url.trim() ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={form.avatar_url.trim()}
                  alt="Avatar preview"
                  className="h-16 w-16 shrink-0 rounded-full border border-[var(--lib-border)] object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
              ) : (
                <div
                  aria-hidden
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--lib-border)] text-xs text-[var(--lib-fg-muted)]"
                >
                  ?
                </div>
              )}
              <input
                type="url"
                value={form.avatar_url}
                onChange={(e) => update("avatar_url", e.target.value)}
                placeholder="https://…"
                aria-label="Avatar URL"
                aria-invalid={avatarOver || undefined}
                className="min-w-0 flex-1 rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-2 text-sm text-[var(--lib-fg)] outline-none ring-[#2D6A4F]/30 focus:ring-2"
                spellCheck={false}
              />
            </div>
            {avatarOver ? (
              <span className="text-[11px] text-red-400">avatar_url is too long.</span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-[var(--lib-fg-muted)]">Banner</span>
            <div className="flex flex-col gap-2">
              {form.banner_url.trim() ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={form.banner_url.trim()}
                  alt="Banner preview"
                  className="h-16 w-full rounded-md border border-[var(--lib-border)] object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
              ) : (
                <div
                  aria-hidden
                  className="flex h-16 w-full items-center justify-center rounded-md border border-dashed border-[var(--lib-border)] text-xs text-[var(--lib-fg-muted)]"
                >
                  No banner
                </div>
              )}
              <input
                type="url"
                value={form.banner_url}
                onChange={(e) => update("banner_url", e.target.value)}
                placeholder="https://…"
                aria-label="Banner URL"
                aria-invalid={bannerOver || undefined}
                className="rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-2 text-sm text-[var(--lib-fg)] outline-none ring-[#2D6A4F]/30 focus:ring-2"
                spellCheck={false}
              />
            </div>
            {bannerOver ? (
              <span className="text-[11px] text-red-400">banner_url is too long.</span>
            ) : null}
          </div>
        </div>
      </section>

      {/* About */}
      <section className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-4">
        <h2 className="text-sm font-semibold text-[var(--lib-fg)]">About</h2>
        <p className="mt-1 text-xs text-[var(--lib-fg-muted)]">
          A short bio plus your discipline (e.g. &ldquo;Digital illustrator&rdquo;) for
          the feed-card byline.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--lib-fg-muted)]">
              Discipline
            </span>
            <input
              type="text"
              value={form.discipline}
              onChange={(e) => update("discipline", e.target.value)}
              placeholder="Illustration, animation, fiction…"
              maxLength={DISCIPLINE_LIMIT + 1}
              className="rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-2 text-sm text-[var(--lib-fg)] outline-none ring-[#2D6A4F]/30 focus:ring-2"
              aria-label="Discipline"
              aria-invalid={disciplineOver || undefined}
            />
            {disciplineOver ? (
              <span className="text-[11px] text-red-400">
                Discipline must be at most {DISCIPLINE_LIMIT} characters.
              </span>
            ) : null}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--lib-fg-muted)]">
              Bio
            </span>
            <textarea
              value={form.bio}
              onChange={(e) => update("bio", e.target.value)}
              rows={3}
              placeholder="One or two sentences about your work."
              className="resize-y rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-2 text-sm text-[var(--lib-fg)] outline-none ring-[#2D6A4F]/30 focus:ring-2"
              aria-label="Bio"
              aria-invalid={bioOver || undefined}
            />
            <span
              className={`self-end text-[10px] ${
                bioOver ? "text-red-400" : "text-[var(--lib-fg-muted)]"
              }`}
            >
              {form.bio.length} / {BIO_LIMIT}
            </span>
          </label>
        </div>
      </section>

      {/* Save / status footer */}
      <footer className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-[var(--lib-border)] bg-[var(--lib-bg)]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-end gap-3">
          {error ? (
            <p role="alert" className="mr-auto text-xs text-red-400">
              {error}
            </p>
          ) : savedNote ? (
            <p className="mr-auto text-xs text-[#40916C]">{savedNote}</p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setForm(baseline);
              setSavedNote(null);
              setError(null);
            }}
            disabled={!isDirty || saving}
            className="rounded-lg border border-[var(--lib-border)] px-4 py-2 text-sm font-medium text-[var(--lib-fg)] transition-colors hover:border-[#2D6A4F]/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Discard changes
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={!isDirty || saving || hasClientError}
            className="flex items-center gap-2 rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#40916C] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </button>
        </div>
      </footer>
    </main>
  );
}

// Re-exported for tests so jest mocks of relay-api.ts get a real type to lean on.
export type { CreatorProfileIdentity } from "@/lib/relay-api";
export { RelayApiError };
