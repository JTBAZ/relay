"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Share2 } from "lucide-react";
import { EditPatronProfileModal } from "@/components/patron/EditPatronProfileModal";
import { PatronProfileAssetImage } from "@/components/patron/PatronProfileAssetImage";
import {
  fetchPatronProfileMe,
  type PatronProfileMe,
} from "@/lib/patron-profile-api";
import {
  PATRON_PROFILE_DEFAULT_BANNER_SRC,
  resolvePatronProfileBannerSrc,
} from "@/lib/patron-profile-banner-presets";
import {
  patronProfileHandleSubtitle,
  patronProfilePrimaryTitle,
} from "@/lib/patron-profile-identity";
import { PATRON_PROFILE_DRAFT_VIEWER } from "./patron-profile-draft-fixtures";

type HeaderIdentity = {
  title: string;
  handleLine: string | null;
  avatarAlt: string;
};

function fixtureIdentity(): HeaderIdentity {
  const viewer = PATRON_PROFILE_DRAFT_VIEWER;
  return {
    title: viewer.displayName,
    handleLine: `@${viewer.handle}`,
    avatarAlt: viewer.displayName,
  };
}

function liveIdentity(profile: {
  display_name: string | null;
  handle: string | null;
}): HeaderIdentity {
  const title = patronProfilePrimaryTitle(profile);
  const handleLine = patronProfileHandleSubtitle(profile);
  return {
    title,
    handleLine,
    avatarAlt: profile.display_name?.trim() || profile.handle?.trim() || title,
  };
}

export function PatronProfileDraftHeader() {
  const viewer = PATRON_PROFILE_DRAFT_VIEWER;
  const [following, setFollowing] = useState(false);
  const [identity, setIdentity] = useState<HeaderIdentity>(() => fixtureIdentity());
  const [bio, setBio] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [identitySource, setIdentitySource] = useState<"loading" | "live" | "fixture">("loading");
  const [liveProfile, setLiveProfile] = useState<PatronProfileMe | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const isOwnProfile = identitySource === "live" && liveProfile !== null;

  useEffect(() => {
    let cancelled = false;
    void fetchPatronProfileMe({ suppressAuthRedirect: true })
      .then((profile) => {
        if (cancelled) return;
        setLiveProfile(profile);
        setIdentity(liveIdentity(profile));
        setBio(profile.bio?.trim() || null);
        setAvatarUrl(profile.avatar_url);
        setBannerUrl(profile.banner_url);
        setIdentitySource("live");
      })
      .catch(() => {
        if (cancelled) return;
        setLiveProfile(null);
        setIdentity(fixtureIdentity());
        setBio(null);
        setAvatarUrl(null);
        setBannerUrl(null);
        setIdentitySource("fixture");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleProfileSaved = (profile: PatronProfileMe) => {
    setLiveProfile(profile);
    setIdentity(liveIdentity(profile));
    setBio(profile.bio?.trim() || null);
    setAvatarUrl(profile.avatar_url);
    setBannerUrl(profile.banner_url);
  };

  const fixtureBannerSrc = resolvePatronProfileBannerSrc({ bannerUrl: null }).src;
  const liveBannerStored =
    bannerUrl ?? PATRON_PROFILE_DEFAULT_BANNER_SRC;

  const bioText =
    identitySource === "live" ? bio : identitySource === "fixture" ? viewer.bio : null;

  return (
    <>
      <header className="relative isolate">
        <div className="relative z-0 h-64 w-full overflow-hidden md:h-80">
          {identitySource === "live" ? (
            <PatronProfileAssetImage
              storedUrl={liveBannerStored}
              width={1920}
              height={640}
              className="h-full w-full object-cover opacity-80"
              fallback={
                // eslint-disable-next-line @next/next/no-img-element -- static default
                <img
                  src={fixtureBannerSrc}
                  alt=""
                  width={1920}
                  height={640}
                  className="h-full w-full object-cover opacity-80"
                />
              }
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- draft fixture
            <img
              src={fixtureBannerSrc}
              alt=""
              width={1920}
              height={640}
              className="h-full w-full object-cover opacity-80"
            />
          )}
          <div className="pointer-events-none absolute inset-0 z-[1] bg-[var(--gradient-fade)]" />
        </div>

        <div className="relative z-10 mx-auto -mt-20 max-w-6xl px-6 md:-mt-24">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="relative z-10 flex flex-col items-start gap-5 md:flex-row md:items-end">
              <div className="relative z-10 h-32 w-32 overflow-hidden rounded-full ring-4 ring-background md:h-40 md:w-40">
                {identitySource === "live" ? (
                  <PatronProfileAssetImage
                    storedUrl={avatarUrl}
                    alt={`${identity.avatarAlt} avatar`}
                    width={512}
                    height={512}
                    className="h-full w-full object-cover"
                    fallback={
                      // eslint-disable-next-line @next/next/no-img-element -- draft fixture
                      <img
                        src={viewer.avatarUrl}
                        alt={`${identity.avatarAlt} avatar`}
                        width={512}
                        height={512}
                        className="h-full w-full object-cover"
                      />
                    }
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- draft fixture
                  <img
                    src={viewer.avatarUrl}
                    alt={`${identity.avatarAlt} avatar`}
                    width={512}
                    height={512}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="relative z-10 pb-2">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-role-label">
                  {viewer.roleLabel}
                </p>
                <h1 className="mt-2 text-3xl font-light tracking-tight text-foreground md:text-4xl">
                  {identity.title}
                </h1>
                {identity.handleLine ? (
                  <p className="mt-1 text-sm text-muted-foreground">{identity.handleLine}</p>
                ) : null}
              </div>
            </div>

            <div className="relative z-10 flex items-center gap-2 pb-2">
              {isOwnProfile ? (
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="inline-flex min-w-32 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-all hover:border-primary hover:text-primary"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit profile
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setFollowing((value) => !value)}
                  className={[
                    "inline-flex min-w-32 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all",
                    following
                      ? "border border-border bg-card text-foreground hover:bg-[#1a1a1a]"
                      : "bg-primary text-[#0a0a0a] hover:bg-[#52b788]",
                  ].join(" ")}
                >
                  {following ? (
                    <>
                      <Check className="h-4 w-4" aria-hidden="true" />
                      Following
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Follow
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:border-primary hover:text-primary"
                aria-label="Share profile"
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {bioText ? (
            <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">{bioText}</p>
          ) : null}
        </div>
      </header>

      {liveProfile ? (
        <EditPatronProfileModal
          open={editOpen}
          onOpenChange={setEditOpen}
          profile={liveProfile}
          onSaved={handleProfileSaved}
        />
      ) : null}
    </>
  );
}
