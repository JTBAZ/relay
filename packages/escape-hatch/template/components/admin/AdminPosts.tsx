"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AdminPostsModel } from "@/lib/admin/load-admin";

function accessLabel(level: string, tierIds: string[]): string {
  if (level === "public") return "Public";
  if (level === "member_only") return "All paid members";
  if (level === "tier_gated") {
    return tierIds.length ? `Tier: ${tierIds.join(", ")}` : "Tier-gated";
  }
  return level;
}

export function AdminPosts({ model }: { model: AdminPostsModel }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const runAttention = (postId: string, action: "mark" | "clear") => {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/attention", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-escape-hatch-local": "1"
          },
          body: JSON.stringify({
            action,
            post_id: postId,
            note: action === "mark" ? "Needs structure review" : undefined
          })
        });
        const body = (await res.json()) as {
          ok?: boolean;
          error?: string;
          production_safe?: boolean;
        };
        if (!res.ok || !body.ok) {
          setError(body.error ?? `Request failed (${res.status})`);
          return;
        }
        setStatus(
          action === "mark"
            ? `Marked ${postId} for attention (local only).`
            : `Cleared attention on ${postId}.`
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
      }
    });
  };

  return (
    <div className="admin-panel">
      <p className="small muted">
        Posts from kit <span className="mono">data/site.json</span>. Mark
        attention is a local-operator note — it does not delete exports or change
        visitor entitlements.
      </p>
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="admin-status" role="status">
          {status}
        </p>
      ) : null}

      {model.sync_conflict_count > 0 ? (
        <p className="admin-banner admin-banner--warn">
          {model.sync_conflict_count} Patreon sync conflict
          {model.sync_conflict_count === 1 ? "" : "s"} — local edits are
          protected. Review on{" "}
          <Link href="/admin/patreon">/admin/patreon</Link>.
        </p>
      ) : null}

      <ul className="admin-post-list">
        {model.posts.map((post) => (
          <li key={post.post_id} className="admin-post-card">
            <div className="admin-post-main">
              <h3 className="admin-post-title">{post.title}</h3>
              <p className="small muted mono">
                {post.post_id} · /{post.slug}
              </p>
              <p className="admin-post-meta">
                <span className="admin-pill">{accessLabel(post.access_level, post.tier_ids)}</span>
                <span className="admin-pill">
                  {post.status === "draft" ? "Draft" : "Published"}
                </span>
                {post.sync_origin ? (
                  <span className="admin-pill">{post.sync_origin}</span>
                ) : null}
                {post.locally_edited ? (
                  <span className="admin-pill">locally edited</span>
                ) : null}
                <span className="muted small">{post.media_count} media</span>
                <span className="muted small">
                  {new Date(post.published_at).toLocaleDateString()}
                </span>
              </p>
              {post.attention_note ? (
                <p className="admin-attention-note" role="status">
                  Attention: {post.attention_note}
                </p>
              ) : null}
            </div>
            <div className="admin-post-actions">
              <Link
                href={`/structure`}
                className="admin-link-btn admin-link-btn--compact"
              >
                Open Structure
              </Link>
              <Link
                href={`/p/${post.slug}`}
                className="admin-link-btn admin-link-btn--compact admin-link-btn--quiet"
              >
                Visitor link
              </Link>
              {post.attention_note ? (
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={pending}
                  onClick={() => runAttention(post.post_id, "clear")}
                >
                  Clear attention
                </button>
              ) : (
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={pending}
                  onClick={() => runAttention(post.post_id, "mark")}
                >
                  Mark attention
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
