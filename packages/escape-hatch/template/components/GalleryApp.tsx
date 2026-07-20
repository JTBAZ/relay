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
import { ConsoleNav } from "@/components/ConsoleNav";
import {
  applyPostOverrides,
  loadPostOverrides
} from "@/lib/site-session";

type Props = {
  site: SiteBundle;
};

function accessLabel(post: ClonePostEntry): string {
  if (post.access.level === "public") return "Public";
  if (post.access.level === "member_only") return "Patrons";
  return `Tier: ${post.access.tier_ids.join(", ")}`;
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

  const liveSite = { ...site, posts };
  return (
    <>
      <ConsoleNav quiet />
      <div className="shell">
        <div className="banner">
          Soft-gate preview — not production security.
        </div>

        <header className="hero">
          <h1>{liveSite.theme.hero.title}</h1>
          {liveSite.theme.hero.subtitle ? (
            <p className="sub">{liveSite.theme.hero.subtitle}</p>
          ) : null}
          {liveSite.theme.hero.bio ? (
            <p className="bio">{liveSite.theme.hero.bio}</p>
          ) : null}
        </header>

        <div className="soft-gate" role="group" aria-label="Demo persona">
          <span>View as</span>
          {personas.map((p) => (
            <button
              key={p.id}
              type="button"
              className={p.id === persona.id ? "active" : undefined}
              onClick={() => setPersonaId(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="grid">
          {liveSite.posts.map((post) => {
            const unlocked = canViewPost(post, persona);
            const thumb = post.media[0]?.content_path;
            const lockClass = unlocked ? "" : `locked ${style}`;
            return (
              <article
                key={post.post_id}
                className={`card ${lockClass}`.trim()}
              >
                <div className="media-wrap">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" />
                  ) : (
                    <div style={{ padding: "2rem", color: "var(--eh-muted)" }}>
                      No media
                    </div>
                  )}
                  {!unlocked ? <PaywallTeaser style={style} /> : null}
                </div>
                <div className="body">
                  <div className="badge">{accessLabel(post)}</div>
                  <h2>
                    {unlocked ? (
                      <Link href={`/p/${post.slug}`}>{post.title}</Link>
                    ) : (
                      post.title
                    )}
                  </h2>
                </div>
              </article>
            );
          })}
        </div>

        <p className="muted small" style={{ marginTop: "2rem" }}>
          <Link href="/structure">← Back to Structure</Link>
          {" · "}
          <Link href="/style">Style dials</Link>
        </p>
      </div>
    </>
  );
}
