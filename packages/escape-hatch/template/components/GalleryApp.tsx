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

function isPublished(post: ClonePostEntry): boolean {
  return post.status !== "draft";
}

function sortGalleryPosts(posts: ClonePostEntry[]): ClonePostEntry[] {
  return [...posts].filter(isPublished).sort((a, b) => {
    const fa =
      typeof a.feature_order === "number" && Number.isFinite(a.feature_order)
        ? a.feature_order
        : Number.POSITIVE_INFINITY;
    const fb =
      typeof b.feature_order === "number" && Number.isFinite(b.feature_order)
        ? b.feature_order
        : Number.POSITIVE_INFINITY;
    if (fa !== fb) return fa - fb;
    return Date.parse(b.published_at) - Date.parse(a.published_at);
  });
}

function resolveThumb(
  post: ClonePostEntry,
  unlocked: boolean
): { mediaId: string; contentPath: string } | undefined {
  if (unlocked) {
    const m = post.media[0];
    if (!m) return undefined;
    return { mediaId: m.media_id, contentPath: m.content_path };
  }
  // Locked: only public cover (never premium /api/media)
  const coverId = post.public_cover_media_id;
  if (!coverId) return undefined;
  const cover = post.media.find((m) => m.media_id === coverId);
  if (!cover) return undefined;
  // Cover must be world-readable path under /media — still don't use /api/media when locked
  if (cover.content_path.startsWith("/media/")) {
    return { mediaId: cover.media_id, contentPath: cover.content_path };
  }
  return undefined;
}

export function GalleryApp({
  site,
  identityMode = "none",
  accessByPostId
}: Props) {
  const personas = site.demo_personas;
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "public");
  const [posts, setPosts] = useState(site.posts);
  const [query, setQuery] = useState("");
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

  const sorted = useMemo(() => sortGalleryPosts(posts), [posts]);
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const visible = useMemo(() => {
    if (!searching) return sorted;
    return sorted.filter((p) => {
      const hay = `${p.title} ${p.body_plain ?? ""} ${p.tag_ids.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, searching, q]);

  const liveSite = { ...site, posts };
  const gridClass = searching
    ? `patron-grid patron-grid--${density} patron-grid--feed`
    : `patron-grid patron-grid--${density} patron-grid--mosaic`;

  return (
    <PatronChrome
      site={liveSite}
      personas={personas}
      personaId={persona.id}
      onPersonaChange={setPersonaId}
      identityMode={identityMode}
      showSoftPersona={!identityConfigured}
      showAbout
    >
      <div className="patron-gallery-tools">
        <label className="patron-search">
          <span className="visually-hidden">Search posts</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts…"
            aria-label="Search posts"
          />
        </label>
        {searching ? (
          <p className="muted small" role="status">
            Showing {visible.length} result{visible.length === 1 ? "" : "s"} for
            “{query.trim()}”
          </p>
        ) : null}
      </div>

      <div className={gridClass} role="list" aria-label="Gallery posts">
        {visible.map((post, index) => {
          const serverAccess = accessByPostId?.[post.post_id];
          const unlocked = identityConfigured
            ? Boolean(serverAccess?.allowed)
            : canViewPost(post, persona);
          const reason = identityConfigured
            ? (serverAccess?.reason ?? "anonymous_denied")
            : unlocked
              ? "soft_persona_preview"
              : "anonymous_denied";
          const audience = audienceForAccess(identityMode, serverAccess);
          const thumbMeta = resolveThumb(post, unlocked);
          const thumb =
            thumbMeta && unlocked
              ? resolveVisitorMediaSrc({
                  mediaId: thumbMeta.mediaId,
                  contentPath: thumbMeta.contentPath,
                  accessLevel: post.access.level
                })
              : thumbMeta && !unlocked
                ? thumbMeta.contentPath
                : undefined;
          const lockClass = unlocked ? "" : `locked ${style}`;
          const featured =
            !searching &&
            (typeof post.feature_order === "number" || index === 0) &&
            index === 0;
          const body = (
            <>
              <div className="media-wrap">
                {thumb ? (
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
                <p className="patron-card-meta">
                  {accessLabel(post, liveSite.tiers)}
                </p>
                <h2 className="patron-card-title">{post.title}</h2>
              </div>
            </>
          );

          return (
            <article
              key={post.post_id}
              className={`patron-card ${featured ? "patron-card--featured" : ""} ${lockClass}`.trim()}
              role="listitem"
              style={{ ["--patron-stagger" as string]: String(index) }}
            >
              <Link
                href={`/p/${post.slug}`}
                className={
                  unlocked
                    ? "patron-card-link"
                    : "patron-card-link patron-card-link--locked"
                }
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
      {visible.length === 0 ? (
        <p className="muted" role="status">
          {searching ? "No posts match this search." : "No published posts yet."}
        </p>
      ) : null}
    </PatronChrome>
  );
}
