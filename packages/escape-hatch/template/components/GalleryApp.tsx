"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  canViewPost,
  type ClonePostEntry,
  type DemoPersona,
  type PaywallStyle,
  type SiteBundle
} from "@/lib/access";
import { PaywallOverlay } from "@/components/PaywallOverlay";
import { PatronChrome } from "@/components/PatronChrome";
import {
  applyPostOverrides,
  loadPostOverrides
} from "@/lib/site-session";
import { resolveVisitorMediaSrc } from "@/lib/media/visitor-src";
import type { IdentityProviderUx, ServerAccessSummary } from "@/lib/paywall/types";
import type { PaywallAudience } from "@/lib/paywall/copy";

type Props = {
  site: SiteBundle;
  /** Provider mode from server — soft persona only when none. */
  identityMode?: IdentityProviderUx;
  /** Per-post server evaluation when Path A/B is active. */
  accessByPostId?: Record<string, ServerAccessSummary>;
};

function accessLabel(post: ClonePostEntry, tiers: SiteBundle["tiers"]): string {
  if (post.access.level === "public") return "Public";
  if (post.access.level === "member_only") return "Patrons";
  const titles = post.access.tier_ids.map((id) => {
    const tier = tiers.find((t) => t.tier_id === id);
    return tier?.title ?? id;
  });
  return titles.length ? titles.join(" · ") : "Tier";
}

function audienceForAccess(
  identityMode: IdentityProviderUx,
  access: ServerAccessSummary | undefined
): PaywallAudience {
  if (identityMode === "none") return "soft_persona_preview";
  if (access?.reason === "soft_persona_blocked") return "soft_persona_blocked";
  if (access?.reason === "staff_override") return "staff";
  if (access && !access.allowed && access.reason !== "anonymous_denied") {
    return "signed_in";
  }
  return "anonymous";
}

export function GalleryApp({
  site,
  identityMode = "none",
  accessByPostId
}: Props) {
  const personas = site.demo_personas;
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "public");
  const [posts, setPosts] = useState(site.posts);
  const identityConfigured =
    identityMode === "supabase" || identityMode === "portable";

  useEffect(() => {
    const overrides = loadPostOverrides(site.site_id);
    setPosts(applyPostOverrides(site.posts, overrides));
  }, [site.site_id, site.posts]);

  const persona: DemoPersona = useMemo(
    () => personas.find((p) => p.id === personaId) ?? personas[0],
    [personas, personaId]
  );
  const style: PaywallStyle = site.theme.paywall_style ?? "blur";
  const density = site.theme.gallery_density ?? "comfortable";

  const liveSite = { ...site, posts };
  return (
    <PatronChrome
      site={liveSite}
      personas={personas}
      personaId={persona.id}
      onPersonaChange={setPersonaId}
      identityMode={identityMode}
      showSoftPersona={!identityConfigured}
    >
      <div
        className={`patron-grid patron-grid--${density}`}
        role="list"
        aria-label="Gallery posts"
      >
        {liveSite.posts.map((post, index) => {
          const serverAccess = accessByPostId?.[post.post_id];
          const unlocked = identityConfigured
            ? Boolean(serverAccess?.allowed)
            : canViewPost(post, persona);
          const reason =
            identityConfigured
              ? (serverAccess?.reason ?? "anonymous_denied")
              : unlocked
                ? "soft_persona_preview"
                : "anonymous_denied";
          const audience = audienceForAccess(identityMode, serverAccess);
          const thumbRaw = post.media[0];
          // Locked premium: never construct / fetch /api/media URLs.
          const thumb =
            thumbRaw && unlocked
              ? resolveVisitorMediaSrc({
                  mediaId: thumbRaw.media_id,
                  contentPath: thumbRaw.content_path,
                  accessLevel: post.access.level
                })
              : undefined;
          const lockClass = unlocked ? "" : `locked ${style}`;
          const body = (
            <>
              <div className="media-wrap">
                {thumb && unlocked ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    width={640}
                    height={480}
                    loading={index < 4 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={index === 0 ? "high" : undefined}
                  />
                ) : !unlocked ? (
                  <div className="patron-media-empty" aria-hidden="true" />
                ) : (
                  <div className="patron-media-empty">No media</div>
                )}
                {!unlocked ? (
                  <PaywallOverlay
                    style={style}
                    allowed={false}
                    reason={reason}
                    audience={audience}
                    message={liveSite.theme.paywall_message}
                    communityCta={liveSite.theme.community_cta}
                    compact
                  />
                ) : null}
              </div>
              <div className="body">
                <div className="badge">{accessLabel(post, liveSite.tiers)}</div>
                <h2 className="patron-card-title">{post.title}</h2>
              </div>
            </>
          );

          return (
            <article
              key={post.post_id}
              className={`patron-card ${lockClass}`.trim()}
              role="listitem"
              style={{ ["--patron-stagger" as string]: String(index) }}
            >
              {/* Locked cards still link to post so paywall CTA / account can be used. */}
              <Link
                href={`/p/${post.slug}`}
                className={unlocked ? "patron-card-link" : "patron-card-link patron-card-link--locked"}
                aria-label={
                  unlocked ? `Open ${post.title}` : `Locked: ${post.title}`
                }
              >
                {body}
              </Link>
            </article>
          );
        })}
      </div>
    </PatronChrome>
  );
}
