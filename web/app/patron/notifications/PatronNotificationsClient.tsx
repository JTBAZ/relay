"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  AtSign,
  Bell,
  CheckCheck,
  Heart,
  Inbox,
  Loader2,
  MessageCircle,
  Newspaper,
  Settings,
  ShieldAlert,
  UserPlus
} from "lucide-react";
import {
  getPatronNotificationUnreadCount,
  listPatronNotifications,
  markPatronNotificationsRead,
  type NotificationKind,
  type NotificationRecord,
  type NotificationsListResult
} from "@/lib/relay-api";

// ─── Dev fixtures ─────────────────────────────────────────────────────────────

type ViewState =
  | "live"
  | "loading"
  | "mixed"
  | "empty"
  | "error"
  | "all-unread"
  | "all-read";

const DEV_OVERRIDES = new Set<ViewState>([
  "mixed",
  "empty",
  "error",
  "all-unread",
  "all-read"
]);

function devToolsEnabled(): boolean {
  return (
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "")
      .toString()
      .toLowerCase() === "true"
  );
}

const NOW_MS = Date.now();
const ISO = (msAgo: number): string => new Date(NOW_MS - msAgo).toISOString();

const FIXTURE_NOTIFICATIONS: NotificationRecord[] = [
  {
    id: "n-tier",
    recipientMembershipId: "fixture-membership",
    relayCreatorId: "creator-aurora",
    kind: "tier_changed",
    payload: {
      prior_tier_ids: ["tier-aurora-bronze"],
      next_tier_ids: ["tier-aurora-silver"],
      next_active: true
    },
    clusterKey: null,
    clusterCount: 1,
    sourceEventId: "ev-tier",
    readAt: null,
    createdAt: ISO(60_000),
    updatedAt: ISO(60_000)
  },
  {
    id: "n-likes",
    recipientMembershipId: "fixture-membership",
    relayCreatorId: "creator-aurora",
    kind: "comment_liked",
    payload: {
      post_id: "post-aurora-1",
      comment_id: "cmt-1",
      latest_actor_account_id: "acc-fan-1",
      latest_kind: "heart"
    },
    clusterKey: "comment_liked:cmt-1",
    clusterCount: 5,
    sourceEventId: "ev-like-5",
    readAt: null,
    createdAt: ISO(15 * 60_000),
    updatedAt: ISO(15 * 60_000)
  },
  {
    id: "n-reply",
    recipientMembershipId: "fixture-membership",
    relayCreatorId: "creator-mistwood",
    kind: "comment_replied",
    payload: {
      post_id: "post-mistwood-7",
      comment_id: "cmt-2",
      parent_comment_id: "cmt-parent-1",
      reply_membership_id: "membership-replier"
    },
    clusterKey: "comment_replied:cmt-parent-1",
    clusterCount: 1,
    sourceEventId: "ev-reply",
    readAt: null,
    createdAt: ISO(2 * 60 * 60_000),
    updatedAt: ISO(2 * 60 * 60_000)
  },
  {
    id: "n-follower",
    recipientMembershipId: "fixture-membership",
    relayCreatorId: "creator-aurora",
    kind: "new_follower",
    payload: {
      follower_account_id: "acc-fan-2",
      followed_account_id: "acc-self"
    },
    clusterKey: "new_follower:acc-self",
    clusterCount: 3,
    sourceEventId: "ev-follow",
    readAt: ISO(24 * 60 * 60_000),
    createdAt: ISO(26 * 60 * 60_000),
    updatedAt: ISO(24 * 60 * 60_000)
  }
];

function fixtureFor(state: ViewState): {
  page: NotificationsListResult;
  unread: number;
} {
  if (state === "empty") return { page: { items: [], nextCursor: null }, unread: 0 };
  if (state === "all-read") {
    const items = FIXTURE_NOTIFICATIONS.map((n) => ({
      ...n,
      readAt: n.readAt ?? ISO(60_000)
    }));
    return { page: { items, nextCursor: null }, unread: 0 };
  }
  if (state === "all-unread") {
    const items = FIXTURE_NOTIFICATIONS.map((n) => ({ ...n, readAt: null }));
    return {
      page: { items, nextCursor: null },
      unread: items.length
    };
  }
  // mixed (default fixture)
  return {
    page: { items: FIXTURE_NOTIFICATIONS, nextCursor: null },
    unread: FIXTURE_NOTIFICATIONS.filter((n) => n.readAt === null).length
  };
}

// ─── Page client ──────────────────────────────────────────────────────────────

export function PatronNotificationsClient(): React.ReactElement {
  const searchParams = useSearchParams();
  const requested = searchParams.get("state");
  const isDevState =
    devToolsEnabled() &&
    typeof requested === "string" &&
    DEV_OVERRIDES.has(requested as ViewState);
  const devState = isDevState ? (requested as ViewState) : null;

  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [unread, setUnread] = useState<number>(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);

  const refresh = useCallback(async () => {
    if (devState !== null) {
      const fx = fixtureFor(devState);
      const filtered = unreadOnly
        ? fx.page.items.filter((n) => n.readAt === null)
        : fx.page.items;
      setItems(filtered);
      setUnread(fx.unread);
      setNextCursor(null);
      setPhase(devState === "error" ? "error" : "ready");
      setErrorMessage(devState === "error" ? "Simulated notifications error." : null);
      return;
    }
    setPhase("loading");
    setErrorMessage(null);
    try {
      const [page, count] = await Promise.all([
        listPatronNotifications({ unreadOnly }),
        getPatronNotificationUnreadCount()
      ]);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setUnread(count.unread_count);
      setPhase("ready");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [devState, unreadOnly]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleMarkOne = async (id: string) => {
    setBusyId(id);
    try {
      if (devState !== null) {
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: ISO(0) } : n)));
        setUnread((u) => Math.max(0, u - 1));
        return;
      }
      await markPatronNotificationsRead({ notificationIds: [id] });
      await refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setPhase("error");
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAll = async () => {
    setBusyAll(true);
    try {
      if (devState !== null) {
        setItems((prev) => prev.map((n) => ({ ...n, readAt: ISO(0) })));
        setUnread(0);
        return;
      }
      await markPatronNotificationsRead({ allUnread: true });
      await refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setPhase("error");
    } finally {
      setBusyAll(false);
    }
  };

  const visibleItems = useMemo(
    () => (unreadOnly ? items.filter((n) => n.readAt === null) : items),
    [items, unreadOnly]
  );

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0]">
      <Header unread={unread} />

      {devState ? <DevStateBanner state={devState} /> : null}

      <Toolbar
        unreadOnly={unreadOnly}
        onUnreadOnlyChange={setUnreadOnly}
        canMarkAll={unread > 0 && !busyAll}
        markingAll={busyAll}
        onMarkAll={() => void handleMarkAll()}
      />

      <main className="mx-auto max-w-3xl px-6 pb-12">
        {phase === "loading" ? <LoadingState /> : null}
        {phase === "error" ? (
          <ErrorState message={errorMessage ?? "Failed to load notifications."} onRetry={refresh} />
        ) : null}
        {phase === "ready" && visibleItems.length === 0 ? (
          <EmptyState unreadOnly={unreadOnly} />
        ) : null}
        {phase === "ready" && visibleItems.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {visibleItems.map((n) => (
              <NotificationRow
                key={n.id}
                record={n}
                busy={busyId === n.id}
                onMarkRead={() => void handleMarkOne(n.id)}
              />
            ))}
          </ul>
        ) : null}
        {nextCursor ? (
          <div className="mt-6 flex justify-center text-[11px] text-[#666]">
            More older notifications available — pagination affordance coming with PE-K hardening.
          </div>
        ) : null}
      </main>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function Header({ unread }: { unread: number }): React.ReactElement {
  return (
    <header className="border-b border-[#1F1F1F] px-6 py-4">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <Bell size={18} className="text-[#40916C]" aria-hidden />
        <h1 className="text-base font-semibold">Notifications</h1>
        {unread > 0 ? (
          <span
            className="rounded-full border border-[#2D6A4F] bg-[#1B4332] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#9bf0c4]"
            aria-label={`${unread} unread`}
          >
            {unread} new
          </span>
        ) : null}
        <Link
          href="/patron/notifications/preferences"
          className="ml-auto inline-flex items-center gap-1 text-xs text-[#888] underline-offset-2 hover:text-white hover:underline"
        >
          <Settings size={12} aria-hidden /> Preferences
        </Link>
      </div>
    </header>
  );
}

function Toolbar({
  unreadOnly,
  onUnreadOnlyChange,
  canMarkAll,
  markingAll,
  onMarkAll
}: {
  unreadOnly: boolean;
  onUnreadOnlyChange: (v: boolean) => void;
  canMarkAll: boolean;
  markingAll: boolean;
  onMarkAll: () => void;
}): React.ReactElement {
  return (
    <div className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-4 text-xs">
      <div className="flex items-center gap-2">
        <FilterChip
          active={!unreadOnly}
          onClick={() => onUnreadOnlyChange(false)}
          label="All"
        />
        <FilterChip
          active={unreadOnly}
          onClick={() => onUnreadOnlyChange(true)}
          label="Unread only"
        />
      </div>
      <button
        onClick={onMarkAll}
        disabled={!canMarkAll}
        className="inline-flex items-center gap-1 rounded border border-[#2A2A2A] px-2 py-1 text-[11px] text-[#bbb] hover:border-[#3A3A3A] hover:text-white disabled:opacity-40"
      >
        <CheckCheck size={11} aria-hidden /> {markingAll ? "Marking…" : "Mark all read"}
      </button>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors",
        active
          ? "border-[#2D6A4F] bg-[#1B4332] text-[#9bf0c4]"
          : "border-[#2A2A2A] text-[#888] hover:border-[#3A3A3A] hover:text-white"
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function NotificationRow({
  record,
  busy,
  onMarkRead
}: {
  record: NotificationRecord;
  busy: boolean;
  onMarkRead: () => void;
}): React.ReactElement {
  const isUnread = record.readAt === null;
  const Icon = iconForKind(record.kind);
  return (
    <li
      className={[
        "rounded-md border p-3",
        isUnread
          ? "border-[#1B4332]/60 bg-[#0c1e16]"
          : "border-[#1F1F1F] bg-[#141414]"
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <Icon
          size={14}
          className={isUnread ? "mt-0.5 text-[#9bf0c4]" : "mt-0.5 text-[#666]"}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium text-[#E0E0E0]">
              {summarize(record)}
            </span>
            {record.clusterCount > 1 ? (
              <span className="rounded-full border border-[#2A2A2A] px-1.5 py-0.5 text-[9px] text-[#888]">
                ×{record.clusterCount}
              </span>
            ) : null}
            {isUnread ? (
              <span
                className="ml-auto h-1.5 w-1.5 rounded-full bg-[#9bf0c4]"
                aria-label="Unread"
              />
            ) : null}
          </div>
          <PayloadPreview record={record} />
          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[#555]">
            <span>{humanise(record.createdAt)}</span>
            {record.relayCreatorId ? <span>· {record.relayCreatorId}</span> : null}
          </div>
        </div>
        {isUnread ? (
          <button
            onClick={onMarkRead}
            disabled={busy}
            className="rounded border border-[#2A2A2A] px-2 py-1 text-[10px] text-[#bbb] hover:border-[#3A3A3A] hover:text-white disabled:opacity-50"
          >
            {busy ? "…" : "Mark read"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function PayloadPreview({ record }: { record: NotificationRecord }): React.ReactElement | null {
  const payload = record.payload;
  switch (record.kind) {
    case "tier_changed": {
      const next = (payload.next_tier_ids as string[] | undefined) ?? [];
      const prior = (payload.prior_tier_ids as string[] | undefined) ?? [];
      const active = payload.next_active === true;
      return (
        <p className="mt-1 text-[11px] text-[#888]">
          {active
            ? `Now on tiers: ${next.length > 0 ? next.join(", ") : "(none)"}`
            : `Tier lapsed; was: ${prior.length > 0 ? prior.join(", ") : "(none)"}`}
        </p>
      );
    }
    case "comment_liked":
    case "comment_replied": {
      const post = payload.post_id as string | undefined;
      return (
        <p className="mt-1 text-[11px] text-[#888]">
          {post ? <>On post <code className="text-[#bbb]">{post}</code></> : "On a post"}
        </p>
      );
    }
    case "new_follower": {
      const who = payload.follower_account_id as string | undefined;
      return (
        <p className="mt-1 text-[11px] text-[#888]">
          From <code className="text-[#bbb]">{who ?? "an account"}</code>
        </p>
      );
    }
    default:
      return null;
  }
}

function summarize(record: NotificationRecord): string {
  switch (record.kind) {
    case "tier_changed":
      return record.payload.next_active === true ? "Tier change applied" : "Tier lapsed";
    case "comment_liked":
      return record.clusterCount > 1
        ? `${record.clusterCount} reactions on your comment`
        : "Someone reacted to your comment";
    case "comment_replied":
      return record.clusterCount > 1
        ? `${record.clusterCount} replies on your comment`
        : "Someone replied to your comment";
    case "new_follower":
      return record.clusterCount > 1
        ? `${record.clusterCount} new followers`
        : "New follower";
    case "new_post_followed":
      return "New post from a creator you follow";
    case "mention":
      return "You were mentioned";
    default:
      return "Notification";
  }
}

function iconForKind(kind: NotificationKind) {
  switch (kind) {
    case "comment_replied":
      return MessageCircle;
    case "comment_liked":
      return Heart;
    case "new_follower":
      return UserPlus;
    case "tier_changed":
      return ShieldAlert;
    case "new_post_followed":
      return Newspaper;
    case "mention":
      return AtSign;
    default:
      return Inbox;
  }
}

function LoadingState(): React.ReactElement {
  return (
    <div className="mt-8 flex items-center justify-center gap-2 text-xs text-[#666]">
      <Loader2 size={14} className="animate-spin" aria-hidden /> Loading notifications…
    </div>
  );
}

function ErrorState({
  message,
  onRetry
}: {
  message: string;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <div className="mx-auto mt-8 flex max-w-md items-start gap-3 rounded-md border border-[#3a1414] bg-[#1f0808] p-4 text-xs text-[#d36a6a]">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1">
        <div className="mb-1 font-medium">Couldn't load notifications</div>
        <div className="text-[11px] text-[#a06a6a]">{message}</div>
        <button
          onClick={onRetry}
          className="mt-2 rounded border border-[#3a1414] px-2 py-0.5 text-[11px] text-white hover:border-[#5a2424]"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

function EmptyState({ unreadOnly }: { unreadOnly: boolean }): React.ReactElement {
  return (
    <div className="mx-auto mt-12 max-w-md rounded-md border border-[#2A2A2A] bg-[#141414] p-6 text-center text-xs text-[#888]">
      <Inbox size={20} aria-hidden className="mx-auto mb-2 text-[#40916C]/60" />
      <div className="font-medium text-[#E0E0E0]">
        {unreadOnly ? "Inbox zero." : "No notifications yet."}
      </div>
      <div className="mt-1 text-[11px] text-[#666]">
        {unreadOnly
          ? "All caught up — switch to All to revisit older notifications."
          : "Replies, reactions, follows, and tier updates will appear here."}
      </div>
    </div>
  );
}

function DevStateBanner({ state }: { state: ViewState }): React.ReactElement {
  return (
    <div className="px-6 pt-4">
      <div className="mx-auto flex max-w-3xl items-start gap-2 rounded-md border border-[#2A2A2A] bg-[#141414] p-3 text-xs text-[#bbb]">
        <span className="mt-0.5 inline-block rounded bg-[#1B4332] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#9bf0c4]">
          dev
        </span>
        <div>
          <div className="font-medium text-[#E0E0E0]">
            Preview state: <code className="text-[#9bf0c4]">{state}</code>
          </div>
          <div className="mt-0.5 text-[10px] text-[#666]">
            Fixture data is being shown so design / QA can review without seeded backend rows.
            Mark-read interactions mutate the local fixture only. Remove <code>?state=</code> to hit
            the live API.
          </div>
        </div>
      </div>
    </div>
  );
}

function humanise(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
