"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { PatronProfileAssetImage } from "@/components/patron/PatronProfileAssetImage";
import {
  PATRON_PROFILE_BIO_UI_LIMIT,
  PATRON_PROFILE_DISPLAY_NAME_LIMIT,
  patchPatronProfileMe,
  type PatronProfileMe,
} from "@/lib/patron-profile-api";
import {
  PATRON_PROFILE_DEFAULT_BANNER_SRC,
  resolvePatronProfileBannerSrc,
} from "@/lib/patron-profile-banner-presets";
import { uploadPatronProfileImage } from "@/lib/patron-profile-upload-api";

export type EditPatronProfileModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: PatronProfileMe;
  onSaved: (profile: PatronProfileMe) => void;
};

export function EditPatronProfileModal({
  open,
  onOpenChange,
  profile,
  onSaved,
}: EditPatronProfileModalProps): React.ReactElement | null {
  const titleId = useId();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [bannerUrl, setBannerUrl] = useState<string | null>(profile.banner_url);
  const avatarPreviewBlobRef = useRef<string | null>(null);
  const bannerPreviewBlobRef = useRef<string | null>(null);
  const [avatarPreviewBlob, setAvatarPreviewBlob] = useState<string | null>(null);
  const [bannerPreviewBlob, setBannerPreviewBlob] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setAvatarBlob = (next: string | null) => {
    if (avatarPreviewBlobRef.current && avatarPreviewBlobRef.current !== next) {
      URL.revokeObjectURL(avatarPreviewBlobRef.current);
    }
    avatarPreviewBlobRef.current = next;
    setAvatarPreviewBlob(next);
  };

  const setBannerBlob = (next: string | null) => {
    if (bannerPreviewBlobRef.current && bannerPreviewBlobRef.current !== next) {
      URL.revokeObjectURL(bannerPreviewBlobRef.current);
    }
    bannerPreviewBlobRef.current = next;
    setBannerPreviewBlob(next);
  };

  const openSyncedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      openSyncedRef.current = false;
      setAvatarBlob(null);
      setBannerBlob(null);
      return;
    }
    if (openSyncedRef.current) return;
    openSyncedRef.current = true;
    setDisplayName(profile.display_name ?? "");
    setBio(profile.bio ?? "");
    setAvatarUrl(profile.avatar_url);
    setBannerUrl(profile.banner_url);
    setError(null);
  }, [open, profile]);

  if (!open) return null;

  const bioOver = bio.length > PATRON_PROFILE_BIO_UI_LIMIT;
  const displayNameOver = displayName.length > PATRON_PROFILE_DISPLAY_NAME_LIMIT;
  const avatarLetter = (
    displayName.trim() ||
    profile.handle?.trim() ||
    "P"
  )
    .slice(0, 1)
    .toUpperCase();
  const busy = saving || avatarUploading || bannerUploading;
  const defaultBannerSrc = resolvePatronProfileBannerSrc({ bannerUrl: null }).src;

  const handleImageUpload = async (kind: "avatar" | "banner", file: File) => {
    setError(null);
    const localPreview = URL.createObjectURL(file);
    if (kind === "avatar") {
      setAvatarBlob(localPreview);
      setAvatarUploading(true);
    } else {
      setBannerBlob(localPreview);
      setBannerUploading(true);
    }
    try {
      const storedPath = await uploadPatronProfileImage({ kind, file });
      if (kind === "avatar") setAvatarUrl(storedPath);
      else setBannerUrl(storedPath);
    } catch (err) {
      if (kind === "avatar") setAvatarBlob(null);
      else setBannerBlob(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (kind === "avatar") setAvatarUploading(false);
      else setBannerUploading(false);
    }
  };

  const handleSave = async () => {
    if (bioOver || displayNameOver || busy) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await patchPatronProfileMe({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
        banner_url: bannerUrl,
      });
      onSaved(updated);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-[#2A2A2A] bg-[#141414] p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-base font-medium text-[#E0E0E0]">
              Edit profile
            </h2>
            <p className="mt-1 text-xs text-[#888]">
              Upload a photo and banner, or keep the defaults.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#888] hover:bg-[#1a1a1a] hover:text-[#E0E0E0]"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-[#666]">Profile photo</p>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#0E0E0E] ring-2 ring-[#2A2A2A]">
                <PatronProfileAssetImage
                  storedUrl={avatarUrl}
                  pendingBlobUrl={avatarPreviewBlob}
                  width={128}
                  height={128}
                  className="h-full w-full object-cover"
                  fallback={
                    <span className="text-xl font-semibold text-[#9bf0c4]">{avatarLetter}</span>
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImageUpload("avatar", file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => avatarInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-md border border-[#2A2A2A] px-3 py-1.5 text-xs text-[#E0E0E0] hover:border-[#2D6A4F] disabled:opacity-60"
                >
                  {avatarUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {avatarUploading ? "Uploading…" : "Upload photo"}
                </button>
                {avatarUrl ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setAvatarUrl(null);
                      setAvatarBlob(null);
                    }}
                    className="text-left text-[11px] text-[#40916C] hover:underline disabled:opacity-60"
                  >
                    Remove photo
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-[#666]">Banner</p>
            <div className="overflow-hidden rounded-md border border-[#2A2A2A]">
              <PatronProfileAssetImage
                storedUrl={bannerUrl ?? PATRON_PROFILE_DEFAULT_BANNER_SRC}
                pendingBlobUrl={bannerPreviewBlob}
                width={640}
                height={160}
                className="h-20 w-full object-cover opacity-90"
                fallback={
                  // eslint-disable-next-line @next/next/no-img-element -- static default
                  <img
                    src={defaultBannerSrc}
                    alt=""
                    width={640}
                    height={160}
                    className="h-20 w-full object-cover opacity-90"
                  />
                }
              />
            </div>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImageUpload("banner", file);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => bannerInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-md border border-[#2A2A2A] px-3 py-1.5 text-xs text-[#E0E0E0] hover:border-[#2D6A4F] disabled:opacity-60"
              >
                {bannerUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                )}
                {bannerUploading ? "Uploading…" : "Upload banner"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBannerUrl(null);
                  setBannerBlob(null);
                }}
                className="text-[11px] text-[#40916C] hover:underline disabled:opacity-60"
              >
                Use default banner
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-patron-display-name" className="text-[10px] uppercase tracking-wide text-[#666]">
              Display name
            </label>
            <input
              id="edit-patron-display-name"
              type="text"
              value={displayName}
              maxLength={PATRON_PROFILE_DISPLAY_NAME_LIMIT}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded border border-[#2A2A2A] bg-[#0E0E0E] px-2 py-1.5 text-sm text-[#E0E0E0] placeholder:text-[#444] focus:border-[#2D6A4F] focus:outline-none"
              placeholder="How your name appears on your profile"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-patron-bio" className="text-[10px] uppercase tracking-wide text-[#666]">
              Bio
            </label>
            <textarea
              id="edit-patron-bio"
              value={bio}
              rows={4}
              onChange={(e) => setBio(e.target.value.slice(0, PATRON_PROFILE_BIO_UI_LIMIT))}
              placeholder="A short line about you (optional)"
              className={[
                "w-full resize-none rounded border bg-[#0E0E0E] px-2 py-1.5 text-sm text-[#E0E0E0] placeholder:text-[#444] focus:outline-none",
                bioOver ? "border-[#5a2424]" : "border-[#2A2A2A] focus:border-[#2D6A4F]",
              ].join(" ")}
            />
            <p className={["text-[10px]", bioOver ? "text-[#d36a6a]" : "text-[#555]"].join(" ")}>
              {bio.length} / {PATRON_PROFILE_BIO_UI_LIMIT}
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-[11px] text-[#d36a6a]">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="rounded-md border border-[#2A2A2A] px-3 py-1.5 text-sm text-[#bbb] hover:bg-[#1a1a1a] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy || bioOver || displayNameOver}
            className="inline-flex items-center gap-2 rounded-md border border-[#2D6A4F] bg-[#1B4332] px-3 py-1.5 text-sm font-medium text-[#9bf0c4] hover:bg-[#244f3a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
