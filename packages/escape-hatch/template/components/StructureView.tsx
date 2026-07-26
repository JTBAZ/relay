"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ClonePostEntry,
  SiteBundle
} from "@/lib/access";
import {
  INTRO_DISMISS_KEY,
  applyPostOverrides,
  loadPostOverrides,
  savePostOverrides,
  type PostAccessOverride
} from "@/lib/site-session";

type BucketDef = {
  id: string;
  title: string;
  blurb: string;
};

function bucketDefs(site: SiteBundle): BucketDef[] {
  const defs: BucketDef[] = [
    {
      id: "public",
      title: "Public",
      blurb: "Anyone can see these — no membership required."
    },
    {
      id: "patrons",
      title: "Patrons",
      blurb: "Visible to any paying member, regardless of tier."
    }
  ];
  for (const tier of site.tiers) {
    defs.push({
      id: tier.tier_id,
      title: tier.title,
      blurb: `Only members on the ${tier.title} tier (or higher, once live gating ships).`
    });
  }
  return defs;
}

function accessForBucket(
  bucketId: string,
  site: SiteBundle
): PostAccessOverride {
  if (bucketId === "public") return { level: "public", tier_ids: [] };
  if (bucketId === "patrons") return { level: "member_only", tier_ids: [] };
  const tier = site.tiers.find((t) => t.tier_id === bucketId);
  return {
    level: "tier_gated",
    tier_ids: tier ? [tier.tier_id] : [bucketId]
  };
}

function postsInBucket(
  posts: ClonePostEntry[],
  bucketId: string
): ClonePostEntry[] {
  if (bucketId === "public") {
    return posts.filter((p) => p.access.level === "public");
  }
  if (bucketId === "patrons") {
    return posts.filter((p) => p.access.level === "member_only");
  }
  return posts.filter(
    (p) =>
      p.access.level === "tier_gated" &&
      p.access.tier_ids.includes(bucketId)
  );
}

function matchesQuery(post: ClonePostEntry, q: string): boolean {
  if (!q) return true;
  const hay = `${post.title} ${post.slug} ${post.tag_ids.join(" ")}`.toLowerCase();
  return hay.includes(q);
}

export function StructureView({ site }: { site: SiteBundle }) {
  const defs = useMemo(() => bucketDefs(site), [site]);
  const [overrides, setOverrides] = useState<Record<string, PostAccessOverride>>(
    {}
  );
  const [activeId, setActiveId] = useState(defs[0]?.id ?? "public");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendMenuFor, setSendMenuFor] = useState<string[] | null>(null);
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    setOverrides(loadPostOverrides(site.site_id));
    try {
      if (localStorage.getItem(INTRO_DISMISS_KEY) !== "1") {
        setShowIntro(true);
      }
    } catch {
      setShowIntro(true);
    }
  }, [site.site_id]);

  const posts = useMemo(
    () => applyPostOverrides(site.posts, overrides),
    [site.posts, overrides]
  );

  const persist = useCallback(
    (next: Record<string, PostAccessOverride>) => {
      setOverrides(next);
      savePostOverrides(site.site_id, next);
    },
    [site.site_id]
  );

  const q = query.trim().toLowerCase();

  const buckets = useMemo(
    () =>
      defs.map((d) => ({
        ...d,
        posts: postsInBucket(posts, d.id).filter((p) => matchesQuery(p, q))
      })),
    [defs, posts, q]
  );

  const active = buckets.find((b) => b.id === activeId) ?? buckets[0];

  const dismissIntro = (remember: boolean) => {
    setShowIntro(false);
    if (remember) {
      try {
        localStorage.setItem(INTRO_DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  };

  const toggleSelect = (postId: string, additive: boolean) => {
    setSelected((prev) => {
      const next = new Set(additive ? prev : []);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  const onCardClick = (
    e: React.MouseEvent,
    postId: string
  ) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      toggleSelect(postId, true);
      setExpandedId(null);
      setSendMenuFor(null);
      return;
    }
    if (selected.size > 0 && !selected.has(postId)) {
      // start fresh selection focus
      setSelected(new Set());
    }
    setExpandedId((cur) => (cur === postId ? null : postId));
    setSendMenuFor(null);
  };

  const movePosts = (postIds: string[], destBucketId: string) => {
    const access = accessForBucket(destBucketId, site);
    const next = { ...overrides };
    for (const id of postIds) {
      next[id] = access;
    }
    persist(next);
    setSelected(new Set());
    setExpandedId(null);
    setSendMenuFor(null);
    setActiveId(destBucketId);
  };

  const sendTargets = defs.filter((d) => d.id !== activeId);

  const openSendMenu = (ids: string[]) => {
    setSendMenuFor(ids);
  };

  return (
    <div className="shell console-page structure-shell">
      {showIntro ? (
        <div className="eh-modal-backdrop" role="presentation">
          <div
            className="eh-modal"
            role="dialog"
            aria-labelledby="eh-structure-intro-title"
            aria-modal="true"
          >
            <h2 id="eh-structure-intro-title">Your membership map</h2>
            <p>
              Here are the tiers we detected from your Patreon and the posts they
              contained. If you&apos;d like to readjust anything, now&apos;s a
              good time — though you can always do it later.
            </p>
            <p className="eh-modal-hint">
              Tip: click a tile to expand it, or Ctrl/⌘-click (or the corner
              check) to select several and move them together.
            </p>
            <div className="eh-modal-actions">
              <button
                type="button"
                className="btn-ghost-solid"
                onClick={() => dismissIntro(false)}
              >
                Got it
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => dismissIntro(true)}
              >
                Don&apos;t show again
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <header className="structure-toolbar">
        <div className="structure-identity">
          <h1>{site.creator.display_name}</h1>
          <span className="structure-stats">
            @{site.creator.handle} · {posts.length} posts · {site.tiers.length}{" "}
            tiers
          </span>
        </div>
        <div className="structure-toolbar-right">
          <label className="structure-search">
            <span className="sr-only">Search posts</span>
            <input
              type="search"
              placeholder="Search posts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>
      </header>

      <div className="bin-rail" role="tablist" aria-label="Access bins">
        {buckets.map((b) => (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={b.id === active?.id}
            className={`bin-chip ${b.id === active?.id ? "is-active" : ""}`}
            onClick={() => {
              setActiveId(b.id);
              setExpandedId(null);
              setSendMenuFor(null);
            }}
          >
            <span className="bin-chip-title">{b.title}</span>
            <span className="bin-chip-count">{b.posts.length}</span>
          </button>
        ))}
      </div>

      <section
        className="bin-panel"
        role="tabpanel"
        aria-label={active?.title ?? "Bin"}
      >
        {active ? (
          <p className="bin-blurb">{active.blurb}</p>
        ) : null}

        {!active || active.posts.length === 0 ? (
          <div className="bin-empty">
            {q ? "No posts match this search." : "Nothing in this bin yet."}
          </div>
        ) : (
          <div className="bin-card-stage">
            <div className="bin-card-grid">
              {active.posts.map((post) => {
                const thumb = post.media[0]?.content_path;
                const isSelected = selected.has(post.post_id);
                const isExpanded = expandedId === post.post_id;
                return (
                  <article
                    key={post.post_id}
                    className={[
                      "bin-card",
                      isSelected ? "is-selected" : "",
                      isExpanded ? "is-expanded" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <button
                      type="button"
                      className="bin-card-check"
                      aria-label={
                        isSelected ? "Deselect post" : "Select post"
                      }
                      aria-pressed={isSelected}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(post.post_id, true);
                      }}
                    />
                    <div
                      className="bin-card-hit"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => onCardClick(e, post.post_id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedId((cur) =>
                            cur === post.post_id ? null : post.post_id
                          );
                        }
                      }}
                    >
                      <div className="bin-card-media">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" />
                        ) : (
                          <div className="bin-card-placeholder">No media</div>
                        )}
                        <div className="bin-card-veil">
                          <span className="bin-card-title">{post.title}</span>
                          <span className="bin-card-meta">
                            {post.media.length} file
                            {post.media.length === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </div>
                    {isExpanded ? (
                      <div className="bin-card-actions">
                        <button
                          type="button"
                          className="btn-primary btn-compact"
                          onClick={() => openSendMenu([post.post_id])}
                        >
                          Send to…
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            {selected.size > 0 ? (
              <div
                className="selection-toast"
                role="status"
                aria-live="polite"
              >
                <span className="selection-toast-count">
                  {selected.size} selected
                </span>
                <button
                  type="button"
                  className="btn-primary btn-compact"
                  onClick={() => openSendMenu([...selected])}
                >
                  Send to…
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {sendMenuFor ? (
        <div
          className="eh-modal-backdrop"
          role="presentation"
          onClick={() => setSendMenuFor(null)}
        >
          <div
            className="eh-modal eh-modal--sm"
            role="dialog"
            aria-labelledby="eh-send-title"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="eh-send-title">
              Send {sendMenuFor.length > 1 ? `${sendMenuFor.length} posts` : "post"}{" "}
              to…
            </h2>
            <ul className="send-target-list">
              {sendTargets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="send-target-btn"
                    onClick={() => movePosts(sendMenuFor, t.id)}
                  >
                    <strong>{t.title}</strong>
                    <span>{t.blurb}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setSendMenuFor(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <footer className="console-cta-row structure-footer">
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowIntro(true)}
        >
          Help
        </button>
        <Link className="btn-primary" href="/style">
          Continue to Style
        </Link>
        <Link className="btn-ghost" href="/preview">
          Preview
        </Link>
      </footer>
    </div>
  );
}
