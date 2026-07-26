"use client";

import { useEffect, useMemo, useState } from "react";
import type { GalleryItem } from "@/lib/relay-api";

export type LinkConfirmMemberDraft = {
  post_id: string;
  title: string;
  variant_role: "full" | "teaser" | "promo" | "repost" | "standalone";
  member_label: string;
  is_cover: boolean;
};

const ROLES: LinkConfirmMemberDraft["variant_role"][] = [
  "full",
  "teaser",
  "promo",
  "repost",
  "standalone",
];

type Props = {
  open: boolean;
  posts: GalleryItem[];
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (members: LinkConfirmMemberDraft[], title: string) => void;
};

export default function LinkConfirmSheet({
  open,
  posts,
  busy = false,
  error = null,
  onClose,
  onConfirm,
}: Props) {
  const uniquePosts = useMemo(() => {
    const seen = new Set<string>();
    const out: GalleryItem[] = [];
    for (const item of posts) {
      if (seen.has(item.post_id)) continue;
      seen.add(item.post_id);
      out.push(item);
    }
    return out;
  }, [posts]);

  const [title, setTitle] = useState("");
  const [drafts, setDrafts] = useState<LinkConfirmMemberDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    setTitle(uniquePosts[0]?.title ?? "");
    setDrafts(
      uniquePosts.map((post, index) => ({
        post_id: post.post_id,
        title: post.title,
        variant_role: index === 0 ? "full" : "standalone",
        member_label: "",
        is_cover: index === 0,
      }))
    );
  }, [open, uniquePosts]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal
        aria-label="Link posts into a Linked Set"
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-white/10 bg-[#0c0f0d] p-4 shadow-2xl"
      >
        <h2 className="text-sm font-semibold text-[var(--lib-fg)]">Link posts</h2>
        <p className="mt-2 text-[11px] leading-relaxed text-white/55">
          Linking groups these posts&apos; analytics together. It won&apos;t change how they look on
          Patreon or your profile — that&apos;s what Collections are for.
        </p>

        <label className="mt-4 block text-[10px] uppercase tracking-wide text-white/40">
          Linked Set title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-[var(--lib-fg)]"
          />
        </label>

        <ul className="mt-4 space-y-3">
          {drafts.map((draft) => (
            <li
              key={draft.post_id}
              className="rounded-xl border border-white/8 bg-white/[0.03] p-3"
            >
              <p className="truncate text-xs font-medium text-[var(--lib-fg)]">{draft.title}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="text-[10px] text-white/40">
                  Role
                  <select
                    value={draft.variant_role}
                    onChange={(e) => {
                      const variant_role = e.target.value as LinkConfirmMemberDraft["variant_role"];
                      setDrafts((prev) =>
                        prev.map((row) =>
                          row.post_id === draft.post_id ? { ...row, variant_role } : row
                        )
                      );
                    }}
                    className="ml-1 rounded border border-white/10 bg-black/50 px-1.5 py-1 text-[11px] text-white/80"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex-1 text-[10px] text-white/40">
                  Label
                  <input
                    value={draft.member_label}
                    placeholder="Page 1"
                    onChange={(e) => {
                      const member_label = e.target.value;
                      setDrafts((prev) =>
                        prev.map((row) =>
                          row.post_id === draft.post_id ? { ...row, member_label } : row
                        )
                      );
                    }}
                    className="ml-1 w-[calc(100%-2.5rem)] rounded border border-white/10 bg-black/50 px-1.5 py-1 text-[11px] text-white/80"
                  />
                </label>
                <label className="flex items-center gap-1 text-[10px] text-white/50">
                  <input
                    type="radio"
                    name="link-cover"
                    checked={draft.is_cover}
                    onChange={() => {
                      setDrafts((prev) =>
                        prev.map((row) => ({
                          ...row,
                          is_cover: row.post_id === draft.post_id,
                        }))
                      );
                    }}
                  />
                  Cover
                </label>
              </div>
            </li>
          ))}
        </ul>

        {error ? <p className="mt-3 text-[11px] text-amber-300">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || drafts.length < 2}
            onClick={() => onConfirm(drafts, title.trim())}
            className="rounded-lg bg-[#9bf0c4] px-3 py-1.5 text-xs font-semibold text-[#050706] disabled:opacity-50"
          >
            {busy ? "Linking…" : "Create Linked Set"}
          </button>
        </div>
      </div>
    </div>
  );
}
