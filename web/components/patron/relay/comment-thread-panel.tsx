"use client";

/**
 * PE-E (BO-P2-04) — live comment thread + per-role moderation surfaces.
 *
 * Renders alongside `<GalleryView>` when `liveCommentsScope` is set. The polished pin
 * tooltip in `<CommentPin />` stays as the hover surface on the media; this panel is the
 * canonical surface for:
 *   - non-anchored / post-level comments
 *   - reactions (4 chips per comment)
 *   - per-role mod menus (author edit/delete; creator pin/hide/delete/revoke-tag; other-patron report/block)
 *   - server-side auto-mod flag banner after the most recent submit
 *
 * Visual ambition is intentionally low (per "skeletal UI" scope). Layout reuses the existing
 * dark-on-#0A0A0A palette; tighter typography pass + animation polish is a later item.
 */

import { useState } from "react";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Heart,
  Lightbulb,
  MessageCircle,
  MoreHorizontal,
  Pin,
  PinOff,
  Smile,
  ThumbsUp,
  Trash2,
  X
} from "lucide-react";
import type {
  CommentReactionAggregate,
  CommentReactionKind,
  PatronCommentRecord
} from "@/lib/relay-api";
import type { UseLiveCommentsResult } from "./use-live-comments";

interface CommentThreadPanelProps {
  live: UseLiveCommentsResult;
  /** Caller's account id; null = anonymous viewer (no reactions, no mod actions). */
  viewerAccountId: string | null;
  /** True when the caller's session owns this relay_creator_id. */
  isCreatorOwner: boolean;
  /** Optional close handler when used as an overlay. */
  onClose?: () => void;
}

const REACTION_META: { kind: CommentReactionKind; Icon: typeof ThumbsUp; label: string }[] = [
  { kind: "like", Icon: ThumbsUp, label: "Like" },
  { kind: "heart", Icon: Heart, label: "Love" },
  { kind: "insightful", Icon: Lightbulb, label: "Insightful" },
  { kind: "laugh", Icon: Smile, label: "Laugh" }
];

const REPORT_REASONS = [
  { value: "spam", label: "Spam or self-promo" },
  { value: "harassment", label: "Harassment" },
  { value: "off-topic", label: "Off-topic" },
  { value: "other", label: "Other" }
];

export function CommentThreadPanel({
  live,
  viewerAccountId,
  isCreatorOwner,
  onClose
}: CommentThreadPanelProps) {
  return (
    <aside
      aria-label="Comment thread"
      className="absolute right-4 top-4 bottom-4 z-30 w-[360px] max-w-[40vw] overflow-y-auto rounded-lg border border-[#2A2A2A] bg-[#0F0F0F] p-3 shadow-2xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-[#888]">
          <MessageCircle size={12} aria-hidden /> Thread
          <span className="rounded-full border border-[#2A2A2A] px-1.5 text-[10px] text-[#666]">
            {live.records.length}
          </span>
        </h2>
        {onClose ? (
          <button
            onClick={onClose}
            aria-label="Close thread"
            className="rounded p-1 text-[#666] hover:bg-[#1A1A1A] hover:text-[#E0E0E0]"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {live.lastAutoModFlags.length > 0 ? (
        <div
          role="status"
          className="mb-2 flex items-start gap-2 rounded-md border border-[#3a2a14] bg-[#1f1408] p-2 text-[11px] text-[#d39e6a]"
        >
          <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
          <div>
            <div className="mb-0.5 font-medium">Awaiting review</div>
            <div className="text-[10px] text-[#a07a4f]">
              Your comment was flagged by auto-moderation
              {" "}
              ({live.lastAutoModFlags.map((f) => f.rule_id).join(", ")}). It will appear once a moderator approves it.
            </div>
            <button
              onClick={live.clearAutoModFlags}
              className="mt-1 text-[10px] text-[#a07a4f] underline-offset-2 hover:underline"
            >
              dismiss
            </button>
          </div>
        </div>
      ) : null}

      {live.status === "loading" ? (
        <ThreadStatus message="Loading comments…" />
      ) : null}
      {live.status === "error" ? (
        <ThreadStatus message={live.errorMessage ?? "Failed to load comments."} variant="error" />
      ) : null}
      {live.status === "ready" && live.records.length === 0 ? (
        <ThreadStatus message="No comments yet — be the first to leave one." />
      ) : null}

      <ul className="space-y-2">
        {live.records.map((record) => (
          <CommentRow
            key={record.id}
            record={record}
            viewerAccountId={viewerAccountId}
            isCreatorOwner={isCreatorOwner}
            live={live}
          />
        ))}
      </ul>
    </aside>
  );
}

function ThreadStatus({
  message,
  variant
}: {
  message: string;
  variant?: "error";
}): React.ReactElement {
  return (
    <div
      className={[
        "mb-2 rounded-md border p-2 text-[11px]",
        variant === "error"
          ? "border-[#3a1414] bg-[#1f0808] text-[#d36a6a]"
          : "border-[#2A2A2A] bg-[#161616] text-[#888]"
      ].join(" ")}
    >
      {message}
    </div>
  );
}

interface CommentRowProps {
  record: PatronCommentRecord;
  viewerAccountId: string | null;
  isCreatorOwner: boolean;
  live: UseLiveCommentsResult;
}

function CommentRow({ record, viewerAccountId, isCreatorOwner, live }: CommentRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(record.body);
  const [reportOpen, setReportOpen] = useState(false);
  const isOwnComment = viewerAccountId !== null && record.patronUserId === viewerAccountId;
  const editWindowOpen =
    isOwnComment && Date.now() - new Date(record.createdAt).getTime() < 15 * 60 * 1000;
  const isHidden = record.modState !== "visible";

  const handleEditSave = async () => {
    const next = editBody.trim();
    if (!next) return;
    await live.edit(record.id, { body: next });
    setEditing(false);
  };

  return (
    <li
      className={[
        "rounded-md border p-2",
        record.creatorPinnedAt
          ? "border-[#2D6A4F]/60 bg-[#0c1e16]"
          : "border-[#1F1F1F] bg-[#141414]"
      ].join(" ")}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {record.creatorPinnedAt ? (
              <Pin size={10} className="text-[#40916C]" aria-label="Pinned by creator" />
            ) : null}
            <span className="truncate text-[11px] font-medium text-[#E0E0E0]">
              Patron · {record.patronUserId.slice(-6)}
            </span>
            {isHidden ? (
              <span
                className="rounded-full border border-[#3a2a14] bg-[#1f1408] px-1 text-[9px] uppercase tracking-wide text-[#d39e6a]"
                title={`Mod state: ${record.modState}`}
              >
                {record.modState}
              </span>
            ) : null}
          </div>
          <div className="text-[9px] text-[#555]">
            {humanise(record.createdAt)}
            {record.editedAt ? <span> · edited</span> : null}
          </div>
        </div>
        <CommentMenu
          isOwnComment={isOwnComment}
          isCreatorOwner={isCreatorOwner}
          editWindowOpen={editWindowOpen}
          isPinned={Boolean(record.creatorPinnedAt)}
          isHidden={isHidden}
          open={menuOpen}
          onToggle={() => setMenuOpen((v) => !v)}
          onEdit={() => {
            setEditing(true);
            setMenuOpen(false);
          }}
          onDelete={async () => {
            setMenuOpen(false);
            await live.remove(record.id);
          }}
          onPinToggle={async () => {
            setMenuOpen(false);
            await live.pin(record.id, !record.creatorPinnedAt);
          }}
          onHideToggle={async () => {
            setMenuOpen(false);
            await live.setModState(record.id, isHidden ? "visible" : "hidden");
          }}
          onReport={() => {
            setReportOpen(true);
            setMenuOpen(false);
          }}
          onBlock={async () => {
            setMenuOpen(false);
            await live.block(record.patronUserId);
          }}
        />
      </div>

      {editing ? (
        <div>
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={2}
            className="w-full resize-none rounded border border-[#242424] bg-[#1A1A1A] px-2 py-1.5 text-[12px] text-[#E0E0E0] focus:border-[#2D6A4F] focus:outline-none"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              onClick={() => {
                setEditing(false);
                setEditBody(record.body);
              }}
              className="text-[10px] text-[#666] hover:text-[#bbb]"
            >
              Cancel
            </button>
            <button
              onClick={handleEditSave}
              className="rounded bg-[#2D6A4F] px-2 py-0.5 text-[10px] text-white hover:bg-[#40916C]"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#C0C0C0]">
          {record.body}
        </p>
      )}

      {record.tagIds.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {record.tagIds.map((tag) => {
            const revoked = record.tagsRevokedByOwner.includes(tag);
            return (
              <span
                key={tag}
                className={[
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px]",
                  revoked
                    ? "border border-[#2A2A2A] text-[#555] line-through"
                    : "border border-[#1B4332]/50 bg-[#0D1F17] text-[#40916C]"
                ].join(" ")}
                title={revoked ? "Revoked by creator" : undefined}
              >
                #{tag}
                {isCreatorOwner ? (
                  <button
                    onClick={() => live.revokeTag(record.id, tag, revoked)}
                    aria-label={revoked ? `Restore tag ${tag}` : `Revoke tag ${tag}`}
                    className="text-[9px] text-[#666] hover:text-[#d39e6a]"
                  >
                    {revoked ? "↺" : "×"}
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}

      <ReactionRow
        commentId={record.id}
        reactions={record.reactions}
        canReact={viewerAccountId !== null}
        onToggle={(kind) => live.react(record.id, kind)}
      />

      {reportOpen ? (
        <ReportInline
          onCancel={() => setReportOpen(false)}
          onSubmit={async (reasonCode, body) => {
            await live.report({
              targetKind: "comment",
              targetId: record.id,
              reasonCode,
              body
            });
            setReportOpen(false);
          }}
        />
      ) : null}
    </li>
  );
}

interface CommentMenuProps {
  isOwnComment: boolean;
  isCreatorOwner: boolean;
  editWindowOpen: boolean;
  isPinned: boolean;
  isHidden: boolean;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPinToggle: () => void;
  onHideToggle: () => void;
  onReport: () => void;
  onBlock: () => void;
}

function CommentMenu({
  isOwnComment,
  isCreatorOwner,
  editWindowOpen,
  isPinned,
  isHidden,
  open,
  onToggle,
  onEdit,
  onDelete,
  onPinToggle,
  onHideToggle,
  onReport,
  onBlock
}: CommentMenuProps) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        aria-label="Comment actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded p-1 text-[#666] hover:bg-[#1A1A1A] hover:text-[#E0E0E0]"
      >
        <MoreHorizontal size={12} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-44 rounded-md border border-[#2A2A2A] bg-[#161616] py-1 shadow-xl"
        >
          {isOwnComment && editWindowOpen ? (
            <MenuItem onClick={onEdit} label="Edit" hint="15 min window" />
          ) : null}
          {isOwnComment ? <MenuItem onClick={onDelete} label="Delete" /> : null}
          {isCreatorOwner ? (
            <>
              <MenuDivider />
              <MenuItem
                onClick={onPinToggle}
                label={isPinned ? "Unpin" : "Pin"}
                Icon={isPinned ? PinOff : Pin}
              />
              <MenuItem
                onClick={onHideToggle}
                label={isHidden ? "Unhide" : "Hide"}
                Icon={isHidden ? Eye : EyeOff}
              />
              {!isOwnComment ? <MenuItem onClick={onDelete} label="Remove" Icon={Trash2} /> : null}
            </>
          ) : null}
          {!isOwnComment ? (
            <>
              <MenuDivider />
              <MenuItem onClick={onReport} label="Report" />
              <MenuItem onClick={onBlock} label="Block author" hint="future-only" />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  onClick,
  label,
  hint,
  Icon
}: {
  onClick: () => void;
  label: string;
  hint?: string;
  Icon?: typeof ThumbsUp;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[11px] text-[#C0C0C0] hover:bg-[#1f1f1f] hover:text-white"
    >
      <span className="flex items-center gap-1.5">
        {Icon ? <Icon size={11} aria-hidden /> : null}
        {label}
      </span>
      {hint ? <span className="text-[9px] text-[#555]">{hint}</span> : null}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t border-[#1F1F1F]" />;
}

function ReactionRow({
  commentId,
  reactions,
  canReact,
  onToggle
}: {
  commentId: string;
  reactions: CommentReactionAggregate[];
  canReact: boolean;
  onToggle: (kind: CommentReactionKind) => Promise<void>;
}) {
  const map = new Map(reactions.map((r) => [r.kind, r]));
  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-1"
      aria-label={`Reactions on comment ${commentId}`}
    >
      {REACTION_META.map(({ kind, Icon, label }) => {
        const agg = map.get(kind);
        const active = agg?.viewerReacted === true;
        return (
          <button
            key={kind}
            onClick={canReact ? () => onToggle(kind) : undefined}
            disabled={!canReact}
            aria-label={`${label}${agg ? ` (${agg.count})` : ""}`}
            aria-pressed={active}
            title={canReact ? label : `${label} (sign in to react)`}
            className={[
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-colors",
              active
                ? "border-[#2D6A4F] bg-[#1B4332] text-[#9bf0c4]"
                : "border-[#2A2A2A] text-[#888] hover:border-[#3A3A3A] hover:text-[#bbb]",
              canReact ? "" : "cursor-not-allowed opacity-60"
            ].join(" ")}
          >
            <Icon size={10} aria-hidden />
            {agg?.count ?? 0}
          </button>
        );
      })}
    </div>
  );
}

function ReportInline({
  onCancel,
  onSubmit
}: {
  onCancel: () => void;
  onSubmit: (reasonCode: string, body?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState(REPORT_REASONS[0].value);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-2 rounded border border-[#3a1414] bg-[#1a0a0a] p-2">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-[#d36a6a]">Report comment</div>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded border border-[#3a1414] bg-[#0e0606] px-1.5 py-1 text-[11px] text-[#C0C0C0] focus:outline-none"
      >
        {REPORT_REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add context (optional)"
        rows={2}
        className="mt-1 w-full resize-none rounded border border-[#3a1414] bg-[#0e0606] px-1.5 py-1 text-[11px] text-[#C0C0C0] placeholder:text-[#444] focus:outline-none"
      />
      <div className="mt-1 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="text-[10px] text-[#666] hover:text-[#bbb]"
          disabled={busy}
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit(reason, body.trim() || undefined);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="rounded bg-[#a04040] px-2 py-0.5 text-[10px] text-white hover:bg-[#c25656] disabled:opacity-60"
        >
          {busy ? "Sending…" : "Submit report"}
        </button>
      </div>
    </div>
  );
}

function humanise(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
