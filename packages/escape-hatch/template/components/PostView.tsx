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
import { ConsoleNav } from "@/components/ConsoleNav";
import {
  applyPostOverrides,
  loadPostOverrides
} from "@/lib/site-session";

type Props = {
  site: SiteBundle;
  slug: string;
};

export function PostView({ site, slug }: Props) {
  const [posts, setPosts] = useState(site.posts);

  useEffect(() => {
    setPosts(
      applyPostOverrides(site.posts, loadPostOverrides(site.site_id))
    );
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
      <>
        <ConsoleNav quiet />
        <div className="shell">
          <p>Post not found.</p>
          <Link href="/preview">Back to Preview</Link>
        </div>
      </>
    );
  }

  const unlocked = canViewPost(post, persona);

  return (
    <>
      <ConsoleNav quiet />
      <div className="shell post-page">
        <div className="banner">Soft gate demo — not production security.</div>
        <p>
          <Link href="/preview">← Preview</Link>
        </p>
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
        <h1>{post.title}</h1>
        <p className="sub" style={{ color: "var(--eh-muted)" }}>
          {new Date(post.published_at).toLocaleDateString()} ·{" "}
          {post.access.level}
        </p>
        {post.media.map((m) => (
          <div
            key={m.media_id}
            className={`media-wrap ${unlocked ? "" : `locked ${style}`}`.trim()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.content_path} alt="" />
            {!unlocked ? <PaywallTeaser style={style} /> : null}
          </div>
        ))}
      </div>
    </>
  );
}
