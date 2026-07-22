"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  canViewPost,
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
  slug: string;
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

export function PostView({ site, slug }: Props) {
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

  if (!post) {
    return (
      <PatronChrome
        site={site}
        personas={personas}
        personaId={personaId}
        onPersonaChange={setPersonaId}
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

  const unlocked = canViewPost(post, persona);

  return (
    <PatronChrome
      site={site}
      personas={personas}
      personaId={persona.id}
      onPersonaChange={setPersonaId}
      compact
    >
      <article className="patron-post">
        <Link className="patron-back" href="/preview">
          ← Gallery
        </Link>
        <header className="patron-post-header">
          <p className="badge">
            {accessLabel(post.access.level, post.access.tier_ids, site.tiers)}
          </p>
          <h1 className="patron-post-title">{post.title}</h1>
          <p className="patron-post-meta">
            <time dateTime={post.published_at}>
              {formatPublished(post.published_at)}
            </time>
          </p>
        </header>

        <div className="patron-post-media">
          {post.media.map((m, index) => (
            <div
              key={m.media_id}
              className={`media-wrap patron-media-frame ${unlocked ? "" : `locked ${style}`}`.trim()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.content_path}
                alt=""
                width={1200}
                height={900}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={index === 0 ? "high" : undefined}
              />
              {!unlocked ? (
                <PaywallTeaser
                  style={style}
                  message={site.theme.paywall_message}
                  communityCta={site.theme.community_cta}
                />
              ) : null}
            </div>
          ))}
        </div>
      </article>
    </PatronChrome>
  );
}
