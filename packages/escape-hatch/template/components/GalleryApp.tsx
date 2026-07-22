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
import { PaywallTeaser } from "@/components/PaywallTeaser";
import { PatronChrome } from "@/components/PatronChrome";
import {
  applyPostOverrides,
  loadPostOverrides
} from "@/lib/site-session";

type Props = {
  site: SiteBundle;
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

export function GalleryApp({ site }: Props) {
  const personas = site.demo_personas;
  const [personaId, setPersonaId] = useState(personas[0]?.id ?? "public");
  const [posts, setPosts] = useState(site.posts);

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
    >
      <div
        className={`patron-grid patron-grid--${density}`}
        role="list"
        aria-label="Gallery posts"
      >
        {liveSite.posts.map((post, index) => {
          const unlocked = canViewPost(post, persona);
          const thumb = post.media[0]?.content_path;
          const lockClass = unlocked ? "" : `locked ${style}`;
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
                ) : (
                  <div className="patron-media-empty">No media</div>
                )}
                {!unlocked ? (
                  <PaywallTeaser
                    style={style}
                    message={liveSite.theme.paywall_message}
                    communityCta={liveSite.theme.community_cta}
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
              {unlocked ? (
                <Link
                  href={`/p/${post.slug}`}
                  className="patron-card-link"
                  aria-label={`Open ${post.title}`}
                >
                  {body}
                </Link>
              ) : (
                <div className="patron-card-static">{body}</div>
              )}
            </article>
          );
        })}
      </div>
    </PatronChrome>
  );
}
