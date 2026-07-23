"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  canViewPost,
  type DemoPersona,
  type PaywallStyle,
  type SiteBundle
} from "@/lib/access";
import { PaywallOverlay } from "@/components/PaywallOverlay";
import { EntitlementStatusBanner } from "@/components/EntitlementStatusBanner";
import { PatronChrome } from "@/components/PatronChrome";
import { VisitorMedia } from "@/components/VisitorMedia";
import {
  applyPostOverrides,
  loadPostOverrides
} from "@/lib/site-session";
import { resolveVisitorMediaSrc } from "@/lib/media/visitor-src";
import type { PaywallAudience } from "@/lib/paywall/copy";
import type { IdentityProviderUx, ServerAccessSummary } from "@/lib/paywall/types";

type Props = {
  site: SiteBundle;
  slug: string;
  /**
   * EH-032 server evaluation. When provider is supabase/portable, this is
   * authoritative for unlock — soft persona cannot elevate.
   * When provider is none, soft persona preview remains for local UX.
   */
  serverAccess?: ServerAccessSummary | null;
};

function formatPublished(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function accessLabel(
  level: string,
  tierIds: string[],
  tiers: SiteBundle["tiers"]
): string {
  if (level === "public") return "Public";
  if (level === "member_only") return "Patrons";
  const titles = tierIds.map((id) => {
    const tier = tiers.find((t) => t.tier_id === id);
    return tier?.title ?? id;
  });
  return titles.length ? titles.join(" · ") : "Tier";
}

function resolveAudience(
  identityConfigured: boolean,
  serverAccess: ServerAccessSummary | null | undefined
): PaywallAudience {
  if (!identityConfigured) return "soft_persona_preview";
  if (serverAccess?.reason === "soft_persona_blocked") return "soft_persona_blocked";
  if (serverAccess?.reason === "staff_override") return "staff";
  if (
    serverAccess &&
    !serverAccess.allowed &&
    serverAccess.reason !== "anonymous_denied" &&
    serverAccess.reason !== "missing_credentials"
  ) {
    return "signed_in";
  }
  return "anonymous";
}

export function PostView({ site, slug, serverAccess }: Props) {
  const [posts, setPosts] = useState(site.posts);

  useEffect(() => {
    setPosts(applyPostOverrides(site.posts, loadPostOverrides(site.site_id)));
  }, [site.site_id, site.posts]);

  const post = posts.find((p) => p.slug === slug);
  const personas = site.demo_personas;
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "public");
  const persona: DemoPersona = useMemo(
    () => personas.find((p) => p.id === personaId) ?? personas[0],
    [personas, personaId]
  );
  const style: PaywallStyle = site.theme.paywall_style ?? "blur";

  const identityMode: IdentityProviderUx =
    serverAccess?.provider === "supabase" ||
    serverAccess?.provider === "portable" ||
    serverAccess?.provider === "invalid" ||
    serverAccess?.provider === "none"
      ? serverAccess.provider
      : "none";

  const identityConfigured =
    identityMode === "supabase" || identityMode === "portable";

  if (!post) {
    return (
      <PatronChrome
        site={site}
        personas={personas}
        personaId={personaId}
        onPersonaChange={setPersonaId}
        identityMode={identityMode}
        showSoftPersona={!identityConfigured}
        compact
      >
        <div className="patron-post">
          <p>Post not found.</p>
          <Link className="patron-back" href="/preview">
            Back to gallery
          </Link>
        </div>
      </PatronChrome>
    );
  }

  // Soft persona UI only when identity is unset; otherwise server evaluator wins.
  const unlocked = identityConfigured
    ? Boolean(serverAccess?.allowed)
    : canViewPost(post, persona);

  const audience = resolveAudience(identityConfigured, serverAccess);
  const reason = identityConfigured
    ? (serverAccess?.reason ?? "anonymous_denied")
    : unlocked
      ? "soft_persona_preview"
      : "anonymous_denied";

  return (
    <PatronChrome
      site={site}
      personas={personas}
      personaId={persona.id}
      onPersonaChange={setPersonaId}
      identityMode={identityMode}
      showSoftPersona={!identityConfigured}
      compact
    >
      <article className="patron-post">
        <Link className="patron-back" href="/preview">
          Gallery
        </Link>

        <div className="patron-post-media">
          {post.media.map((m, index) => {
            // Locked: do not resolve /api/media — no byte fetch.
            const src = unlocked
              ? resolveVisitorMediaSrc({
                  mediaId: m.media_id,
                  contentPath: m.content_path,
                  accessLevel: post.access.level
                })
              : null;
            return (
              <div
                key={m.media_id}
                className={`media-wrap patron-media-frame ${unlocked ? "" : `locked ${style}`}`.trim()}
              >
                {unlocked && src ? (
                  <VisitorMedia
                    src={src}
                    width={1200}
                    height={900}
                    loading={index === 0 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : undefined}
                  />
                ) : (
                  <div className="patron-media-empty" aria-hidden="true" />
                )}
                {!unlocked ? (
                  <PaywallOverlay
                    style={style}
                    allowed={false}
                    reason={reason}
                    audience={audience}
                    message={site.theme.paywall_message}
                    communityCta={site.theme.community_cta}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        <header className="patron-post-header">
          <p className="patron-card-meta">
            {accessLabel(post.access.level, post.access.tier_ids, site.tiers)}
          </p>
          <h1 className="patron-post-title">{post.title}</h1>
          <p className="patron-post-meta">
            <time dateTime={post.published_at}>
              {formatPublished(post.published_at)}
            </time>
          </p>
          <EntitlementStatusBanner
            access={serverAccess}
            softPreview={!identityConfigured}
          />
        </header>
      </article>
    </PatronChrome>
  );
}
