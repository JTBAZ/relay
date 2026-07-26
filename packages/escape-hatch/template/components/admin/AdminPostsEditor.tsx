"use client";

import { adminLocalFetch } from "./adminLocalFetch";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AdminPostsModel } from "@/lib/admin/load-admin";

type TierOption = { tier_id: string; title: string };

type Props = {
  model: AdminPostsModel;
  tiers: TierOption[];
};

const emptyForm = {
  post_id: "",
  title: "",
  slug: "",
  access_level: "public" as "public" | "member_only" | "tier_gated",
  tier_ids: "" as string,
  status: "published" as "draft" | "published",
  feature_order: "",
  body_plain: "",
  public_cover_media_id: ""
};

/**
 * EH-060 post create/edit form — mutates data/site.json via admin API.
 */
export function AdminPostsEditor({ model, tiers }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [uploadPostId, setUploadPostId] = useState("");

  function loadPost(postId: string) {
    const p = model.posts.find((x) => x.post_id === postId);
    if (!p) return;
    setForm({
      post_id: p.post_id,
      title: p.title,
      slug: p.slug,
      access_level: p.access_level as typeof form.access_level,
      tier_ids: p.tier_ids.join(", "),
      status: p.status,
      feature_order:
        p.feature_order != null ? String(p.feature_order) : "",
      body_plain: p.body_plain ?? "",
      public_cover_media_id: p.public_cover_media_id ?? ""
    });
    setUploadPostId(p.post_id);
  }

  function save() {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const res = await adminLocalFetch("/api/admin/posts", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          post_id: form.post_id || undefined,
          title: form.title,
          slug: form.slug || undefined,
          access_level: form.access_level,
          tier_ids: form.tier_ids
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          status: form.status,
          feature_order: form.feature_order
            ? Number(form.feature_order)
            : null,
          body_plain: form.body_plain || null,
          public_cover_media_id: form.public_cover_media_id || null
        })
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        created?: boolean;
        post?: { post_id: string };
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "save_failed");
        return;
      }
      setStatus(json.created ? "Created post." : "Updated post.");
      if (json.post?.post_id) setUploadPostId(json.post.post_id);
      setForm((f) => ({
        ...f,
        post_id: json.post?.post_id ?? f.post_id
      }));
      router.refresh();
    });
  }

  function remove() {
    if (!form.post_id) return;
    setError(null);
    startTransition(async () => {
      const res = await adminLocalFetch("/api/admin/posts", {
        method: "DELETE",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ post_id: form.post_id })
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "delete_failed");
        return;
      }
      setForm(emptyForm);
      setStatus("Deleted post.");
      router.refresh();
    });
  }

  function upload(file: File | null) {
    if (!file || !uploadPostId) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("post_id", uploadPostId);
      fd.set("file", file);
      const res = await adminLocalFetch("/api/admin/media/upload", {
        method: "POST",
        body: fd
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "upload_failed");
        return;
      }
      setStatus(`Attached ${file.name} to ${uploadPostId}.`);
      router.refresh();
    });
  }

  return (
    <div className="admin-panel">
      <h2>Create / edit post</h2>
      <p className="muted small">
        Writes <span className="mono">data/site.json</span> and optional local
        media under <span className="mono">data/private-media/</span>. R2
        multipart and rich HTML are later slices. productionSafe: false · EH-060
      </p>

      <label className="admin-field">
        <span>Load existing</span>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) loadPost(e.target.value);
          }}
          disabled={pending}
        >
          <option value="">— select —</option>
          {model.posts.map((p) => (
            <option key={p.post_id} value={p.post_id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>

      <label className="admin-field">
        <span>Title</span>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          disabled={pending}
        />
      </label>
      <label className="admin-field">
        <span>Slug (optional)</span>
        <input
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          disabled={pending}
        />
      </label>
      <label className="admin-field">
        <span>Access</span>
        <select
          value={form.access_level}
          onChange={(e) =>
            setForm({
              ...form,
              access_level: e.target.value as typeof form.access_level
            })
          }
          disabled={pending}
        >
          <option value="public">Public</option>
          <option value="member_only">All paid members</option>
          <option value="tier_gated">Tier-gated</option>
        </select>
      </label>
      {form.access_level === "tier_gated" ? (
        <label className="admin-field">
          <span>Tier ids (comma-separated)</span>
          <input
            value={form.tier_ids}
            onChange={(e) => setForm({ ...form, tier_ids: e.target.value })}
            disabled={pending}
            placeholder={tiers.map((t) => t.tier_id).join(", ")}
          />
        </label>
      ) : null}
      <label className="admin-field">
        <span>Status</span>
        <select
          value={form.status}
          onChange={(e) =>
            setForm({
              ...form,
              status: e.target.value as "draft" | "published"
            })
          }
          disabled={pending}
        >
          <option value="published">Published</option>
          <option value="draft">Draft (hidden from gallery)</option>
        </select>
      </label>
      <label className="admin-field">
        <span>Feature order (lower = earlier)</span>
        <input
          value={form.feature_order}
          onChange={(e) => setForm({ ...form, feature_order: e.target.value })}
          disabled={pending}
          placeholder="e.g. 1"
        />
      </label>
      <label className="admin-field">
        <span>Body (plain text)</span>
        <textarea
          value={form.body_plain}
          onChange={(e) => setForm({ ...form, body_plain: e.target.value })}
          disabled={pending}
          rows={4}
        />
      </label>
      <label className="admin-field">
        <span>Public cover media id (optional)</span>
        <input
          value={form.public_cover_media_id}
          onChange={(e) =>
            setForm({ ...form, public_cover_media_id: e.target.value })
          }
          disabled={pending}
        />
      </label>

      {error ? <p role="alert">{error}</p> : null}
      {status ? <p role="status">{status}</p> : null}

      <p className="eh-account-actions">
        <button type="button" onClick={save} disabled={pending || !form.title}>
          {pending ? "Saving…" : form.post_id ? "Update post" : "Create post"}
        </button>
        <button
          type="button"
          onClick={() => setForm(emptyForm)}
          disabled={pending}
        >
          Clear form
        </button>
        {form.post_id ? (
          <button type="button" onClick={remove} disabled={pending}>
            Delete
          </button>
        ) : null}
      </p>

      <h3>Attach local media</h3>
      <p className="muted small">
        Upload to post{" "}
        <span className="mono">{uploadPostId || "(save a post first)"}</span>
      </p>
      <input
        type="file"
        disabled={pending || !uploadPostId}
        onChange={(e) => upload(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
