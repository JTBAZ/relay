import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  fetchPublicPatronProfileByHandle,
  type PublicPatronProfile
} from "@/lib/relay-api";

/**
 * PE-K Rest (BO-P4-04) — public patron profile page.
 *
 * SEO contract:
 *   - generateMetadata sets title + description + OpenGraph + Twitter card + canonical URL
 *     from the profile row. Avatar (when present) is the OG image; banner is the secondary OG image.
 *   - JSON-LD ProfilePage structured data is emitted inline so search crawlers can build rich
 *     results without parsing meta tags.
 *   - 404 paths use Next.js notFound() so the framework's standard 404 layout takes over.
 *
 * Privacy:
 *   - The backend treats "private profile" and "missing handle" identically (both 404). This
 *     page mirrors that: notFound() in both cases. No leakage about whether a handle exists.
 *   - robots.txt should allow /p/* (handled at deploy layer); per-page noindex is unnecessary
 *     because the backend already filters non-public profiles.
 *
 * Out of scope for v1 (queued for the nav unification + polish pass):
 *   - "Follow this patron" CTA (PE-C account-follow endpoint exists; UI lands when the
 *     creator/patron-shell separation tightens up).
 *   - Public-collection detail pages (this page links + summarizes; per-collection detail is
 *     a future surface shared with the account owner's library view).
 */

interface Props {
  params: { handle: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const handle = decodeURIComponent(params.handle).trim();
  let profile: PublicPatronProfile | null = null;
  try {
    profile = await fetchPublicPatronProfileByHandle(handle);
  } catch {
    // Network / 5xx -- fall through to a generic title; the page render below will surface
    // its own retry / error state.
  }

  if (!profile) {
    return {
      title: "Profile not found · Relay",
      robots: { index: false, follow: false }
    };
  }

  const title = profile.display_name
    ? `${profile.display_name} (@${profile.handle}) · Relay`
    : `@${profile.handle} · Relay`;
  const description =
    profile.bio?.slice(0, 200) ??
    `Public Relay profile for @${profile.handle}.`;
  const canonical = `/p/${profile.handle}`;
  const ogImage = profile.avatar_url ?? profile.banner_url ?? undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      title,
      description,
      url: canonical,
      images: ogImage ? [{ url: ogImage }] : undefined,
      ...(profile.handle ? { username: profile.handle } : {})
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined
    }
  };
}

export default async function PublicPatronProfilePage({ params }: Props) {
  const handle = decodeURIComponent(params.handle).trim();
  const profile = await fetchPublicPatronProfileByHandle(handle);
  if (!profile) {
    notFound();
  }
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0]">
      <ProfileJsonLd profile={profile} />
      <ProfileHero profile={profile} />
      <main className="mx-auto max-w-3xl px-6 py-8">
        {profile.bio ? (
          <section aria-labelledby="bio-heading" className="mb-8">
            <h2
              id="bio-heading"
              className="mb-2 text-[10px] uppercase tracking-wide text-[#666]"
            >
              About
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#bbb]">
              {profile.bio}
            </p>
          </section>
        ) : null}

        <section aria-labelledby="collections-heading">
          <h2
            id="collections-heading"
            className="mb-3 text-[10px] uppercase tracking-wide text-[#666]"
          >
            Public collections
          </h2>
          {profile.public_collections.length === 0 ? (
            <p className="text-xs text-[#666]">
              @{profile.handle} hasn't shared any public collections yet.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {profile.public_collections.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md border border-[#1F1F1F] bg-[#141414] p-3"
                >
                  <h3 className="text-sm font-medium text-[#E0E0E0]">{c.title}</h3>
                  <p className="mt-1 text-[11px] text-[#888]">
                    {c.entry_count} {c.entry_count === 1 ? "entry" : "entries"}
                  </p>
                  <p className="mt-1 text-[10px] text-[#555]">
                    Created {new Date(c.created_at).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-10 border-t border-[#1F1F1F] pt-4 text-center text-[10px] text-[#555]">
          <Link
            href="/landing"
            className="text-[#40916C] underline-offset-2 hover:underline"
          >
            What is Relay?
          </Link>
        </footer>
      </main>
    </div>
  );
}

function ProfileHero({ profile }: { profile: PublicPatronProfile }): React.ReactElement {
  return (
    <header className="border-b border-[#1F1F1F]">
      {profile.banner_url ? (
        <div
          className="h-32 w-full bg-cover bg-center sm:h-44"
          style={{ backgroundImage: `url(${profile.banner_url})` }}
          role="img"
          aria-label={`${profile.handle} banner`}
        />
      ) : (
        <div className="h-32 w-full bg-gradient-to-br from-[#1B4332] via-[#0c1e16] to-[#0A0A0A] sm:h-44" />
      )}
      <div className="mx-auto max-w-3xl px-6 pb-4">
        <div className="-mt-10 flex items-end gap-3 sm:-mt-12 sm:gap-4">
          <Avatar profile={profile} />
          <div className="min-w-0 flex-1 pb-2">
            <h1 className="truncate text-lg font-semibold text-[#E0E0E0] sm:text-xl">
              {profile.display_name ?? `@${profile.handle}`}
            </h1>
            {profile.display_name ? (
              <p className="text-xs text-[#888]">@{profile.handle}</p>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}

function Avatar({ profile }: { profile: PublicPatronProfile }): React.ReactElement {
  if (profile.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar served from a third-party host; next/image config out of scope here
      <img
        src={profile.avatar_url}
        alt={`${profile.handle} avatar`}
        width={80}
        height={80}
        className="h-16 w-16 shrink-0 rounded-full border-2 border-[#0A0A0A] object-cover sm:h-20 sm:w-20"
      />
    );
  }
  // Letter fallback so the page renders cleanly even when the patron hasn't uploaded an avatar.
  const letter = (profile.display_name ?? profile.handle).slice(0, 1).toUpperCase();
  return (
    <div
      aria-hidden
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-[#0A0A0A] bg-[#1B4332] text-xl font-semibold text-[#9bf0c4] sm:h-20 sm:w-20 sm:text-2xl"
    >
      {letter}
    </div>
  );
}

/**
 * JSON-LD ProfilePage. Serializes inline as a <script type="application/ld+json">; Next.js
 * will keep it in the SSR HTML where crawlers can pick it up.
 */
function ProfileJsonLd({ profile }: { profile: PublicPatronProfile }): React.ReactElement {
  const data = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: profile.display_name ?? `@${profile.handle}`,
      alternateName: `@${profile.handle}`,
      ...(profile.bio ? { description: profile.bio } : {}),
      ...(profile.avatar_url ? { image: profile.avatar_url } : {})
    }
  };
  return (
    <script
      type="application/ld+json"
      // JSON.stringify is the safe payload here; the only attacker-controlled field is bio,
      // which can't break a JSON string. React will not interpret it as HTML.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
