"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Clock,
  Download,
  Loader2,
  Settings,
  ShieldAlert,
  Undo2,
  UserMinus
} from "lucide-react";
import {
  cancelPatronAccountDeletion,
  deleteCreatorRelationship,
  downloadPatronAccountExport,
  getPendingPatronAccountDeletion,
  requestPatronAccountDeletion,
  type CreatorRelationshipDeletionCounts,
  type PendingDeletion
} from "@/lib/relay-api";
import { fetchPatronFollows, type PatronFollowApiItem } from "@/lib/patron-follows-api";
import { ConfirmDestructiveDialog } from "@/app/components/ConfirmDestructiveDialog";

// ─── Dev fixtures ─────────────────────────────────────────────────────────────

type ViewState = "live" | "loading" | "mixed" | "empty" | "error" | "pending-deletion";

const DEV_OVERRIDES = new Set<ViewState>(["mixed", "empty", "error", "pending-deletion"]);

function devToolsEnabled(): boolean {
  return (
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "")
      .toString()
      .toLowerCase() === "true"
  );
}

const NOW_ISO = new Date().toISOString();

const FIXTURE_FOLLOWS: PatronFollowApiItem[] = [
  { relay_creator_id: "creator-aurora", created_at: NOW_ISO },
  { relay_creator_id: "creator-mistwood", created_at: NOW_ISO },
  { relay_creator_id: "creator-nightshade", created_at: NOW_ISO }
];

const FIXTURE_PENDING: PendingDeletion = {
  id: "del-fixture",
  requested_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  scheduled_for: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
  reason: "fixture preview"
};

interface Fixture {
  follows: PatronFollowApiItem[];
  pending: PendingDeletion | null;
  errored: boolean;
}

function fixtureFor(state: ViewState): Fixture {
  if (state === "empty") return { follows: [], pending: null, errored: false };
  if (state === "error") return { follows: [], pending: null, errored: true };
  if (state === "pending-deletion") {
    return { follows: FIXTURE_FOLLOWS, pending: FIXTURE_PENDING, errored: false };
  }
  return { follows: FIXTURE_FOLLOWS, pending: null, errored: false };
}

// ─── Page client ──────────────────────────────────────────────────────────────

export function PatronSettingsClient(): React.ReactElement {
  const searchParams = useSearchParams();
  const requested = searchParams.get("state");
  const isDevState =
    devToolsEnabled() &&
    typeof requested === "string" &&
    DEV_OVERRIDES.has(requested as ViewState);
  const devState = isDevState ? (requested as ViewState) : null;

  const [follows, setFollows] = useState<PatronFollowApiItem[]>([]);
  const [pending, setPending] = useState<PendingDeletion | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (devState !== null) {
      const fx = fixtureFor(devState);
      setFollows(fx.follows);
      setPending(fx.pending);
      setPhase(fx.errored ? "error" : "ready");
      setErrorMessage(fx.errored ? "Simulated settings error." : null);
      return;
    }
    setPhase("loading");
    setErrorMessage(null);
    try {
      const [followsRes, pendingRes] = await Promise.all([
        fetchPatronFollows(),
        getPendingPatronAccountDeletion()
      ]);
      setFollows(followsRes.items);
      setPending(pendingRes.pending_deletion);
      setPhase("ready");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [devState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0]">
      <Header />

      {devState ? <DevStateBanner state={devState} /> : null}

      <main className="mx-auto max-w-3xl px-6 pb-12 pt-4 space-y-6">
        {phase === "loading" ? <LoadingState /> : null}
        {phase === "error" ? (
          <ErrorState message={errorMessage ?? "Failed to load settings."} onRetry={refresh} />
        ) : null}

        {phase === "ready" ? (
          <>
            <ExportSection devMode={devState !== null} />
            <PerCreatorUnwindSection
              follows={follows}
              devMode={devState !== null}
              onLeft={(relayCreatorId) =>
                setFollows((prev) =>
                  prev.filter((f) => f.relay_creator_id !== relayCreatorId)
                )
              }
            />
            <AccountDeletionSection
              pending={pending}
              devMode={devState !== null}
              onPendingChange={setPending}
            />
            <NotificationPreferencesStubSection />
          </>
        ) : null}
      </main>
    </div>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function ExportSection({ devMode }: { devMode: boolean }): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      if (devMode) {
        const blob = new Blob(
          [JSON.stringify({ schema_version: "1.0", note: "fixture export" }, null, 2)],
          { type: "application/json" }
        );
        triggerDownload(blob, `relay-account-fixture-${new Date().toISOString().slice(0, 10)}.json`);
        return;
      }
      const { blob, filename } = await downloadPatronAccountExport();
      triggerDownload(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      icon={<Download size={16} className="text-[#40916C]" aria-hidden />}
      title="Export your data"
      description="Download a JSON archive of every row Relay holds for your account: profile, memberships, follows, favorites, collections, comments, reactions, notifications, and reports you've filed."
    >
      <button
        onClick={() => void handleExport()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded border border-[#2D6A4F] bg-[#1B4332] px-3 py-1.5 text-[12px] font-medium text-[#9bf0c4] hover:bg-[#244f3a] disabled:opacity-60"
      >
        {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Download size={12} aria-hidden />}
        {busy ? "Preparing…" : "Download bundle (JSON)"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-[11px] text-[#d36a6a]">
          {error}
        </p>
      ) : null}
      <p className="mt-2 text-[10px] text-[#555]">
        OAuth tokens, password hashes, and other people{"'"}s data about you are intentionally
        excluded.
      </p>
    </Section>
  );
}

function PerCreatorUnwindSection({
  follows,
  devMode,
  onLeft
}: {
  follows: PatronFollowApiItem[];
  devMode: boolean;
  onLeft: (relayCreatorId: string) => void;
}): React.ReactElement {
  const [target, setTarget] = useState<string | null>(null);
  const [lastCounts, setLastCounts] = useState<{
    relayCreatorId: string;
    counts: CreatorRelationshipDeletionCounts;
  } | null>(null);

  const handleLeave = async (relayCreatorId: string) => {
    if (devMode) {
      // Synthetic counts for the preview state.
      setLastCounts({
        relayCreatorId,
        counts: {
          favorites: 4,
          collections: 2,
          collectionEntries: 7,
          comments: 5,
          commentReactions: 3,
          contentReports: 1,
          notificationPreferences: 2,
          notifications: 6,
          memberships: 1
        }
      });
      onLeft(relayCreatorId);
      return;
    }
    const result = await deleteCreatorRelationship(relayCreatorId);
    setLastCounts({ relayCreatorId, counts: result.counts });
    onLeft(relayCreatorId);
  };

  return (
    <Section
      icon={<UserMinus size={16} className="text-[#d39e6a]" aria-hidden />}
      title="Leave a creator"
      description="Removes everything tying you to one creator: your favorites, collections, comments, reactions, reports, and the membership row itself. Your other creator relationships and your global account stay intact. This action cannot be undone."
    >
      {follows.length === 0 ? (
        <p className="text-[11px] text-[#888]">
          You don{"'"}t have any creator memberships yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {follows.map((f) => (
            <li
              key={f.relay_creator_id}
              className="flex items-center justify-between gap-3 rounded border border-[#1F1F1F] bg-[#141414] p-3"
            >
              <div className="min-w-0">
                <code className="truncate text-[12px] text-[#E0E0E0]">
                  {f.relay_creator_id}
                </code>
                <div className="mt-0.5 text-[10px] text-[#555]">
                  Followed since {new Date(f.created_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => setTarget(f.relay_creator_id)}
                className="rounded border border-[#3a2a14] bg-[#1f1408] px-2 py-1 text-[11px] text-[#d39e6a] hover:border-[#5a4424]"
              >
                Leave
              </button>
            </li>
          ))}
        </ul>
      )}

      {lastCounts ? (
        <div className="mt-3 rounded border border-[#2D6A4F]/40 bg-[#0c1e16] p-2 text-[11px] text-[#9bf0c4]">
          Removed your relationship with{" "}
          <code className="text-[#bbb]">{lastCounts.relayCreatorId}</code>:{" "}
          {summariseCounts(lastCounts.counts)}.
        </div>
      ) : null}

      <ConfirmDestructiveDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        title={`Leave ${target ?? "this creator"}?`}
        description={
          <>
            This permanently removes every favorite, collection, comment, reaction, report, and
            preference tied to <code className="text-[#bbb]">{target}</code>. Your global account
            stays. This action cannot be undone.
          </>
        }
        confirmPhrase="LEAVE"
        confirmLabel="Leave creator"
        onConfirm={async () => {
          if (target) await handleLeave(target);
        }}
      />
    </Section>
  );
}

function AccountDeletionSection({
  pending,
  devMode,
  onPendingChange
}: {
  pending: PendingDeletion | null;
  devMode: boolean;
  onPendingChange: (next: PendingDeletion | null) => void;
}): React.ReactElement {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async () => {
    if (devMode) {
      const next: PendingDeletion = {
        id: "del-fixture-" + Math.random().toString(36).slice(2, 8),
        requested_at: new Date().toISOString(),
        scheduled_for: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        reason: reason.trim() || null
      };
      onPendingChange(next);
      setReason("");
      return;
    }
    const result = await requestPatronAccountDeletion({
      reason: reason.trim() || undefined
    });
    onPendingChange({
      id: result.id,
      requested_at: result.requested_at,
      scheduled_for: result.scheduled_for,
      reason: result.reason
    });
    setReason("");
  };

  const handleCancel = async () => {
    setBusy(true);
    setError(null);
    try {
      if (devMode) {
        onPendingChange(null);
        return;
      }
      await cancelPatronAccountDeletion();
      onPendingChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      icon={<ShieldAlert size={16} className="text-[#d36a6a]" aria-hidden />}
      title="Delete your Relay account"
      description="Schedules a full account deletion after a 7-day grace period. During the grace window you can cancel from this page. After the grace window expires the deletion runs automatically and cannot be undone."
    >
      {pending ? (
        <div className="space-y-3">
          <div className="rounded border border-[#3a2a14] bg-[#1f1408] p-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-[#d39e6a]">
              <Clock size={12} aria-hidden /> Deletion pending
            </div>
            <p className="mt-1 text-[11px] text-[#bbb]">
              Scheduled for{" "}
              <strong className="text-[#E0E0E0]">
                {new Date(pending.scheduled_for).toLocaleString()}
              </strong>
              .{" "}
              {gracePhrase(pending.scheduled_for)}
            </p>
            {pending.reason ? (
              <p className="mt-1 text-[10px] text-[#666]">
                Reason: <em>{pending.reason}</em>
              </p>
            ) : null}
          </div>
          <button
            onClick={() => void handleCancel()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded border border-[#2D6A4F] bg-[#1B4332] px-3 py-1.5 text-[12px] font-medium text-[#9bf0c4] hover:bg-[#244f3a] disabled:opacity-60"
          >
            {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Undo2 size={12} aria-hidden />}
            {busy ? "Cancelling…" : "Cancel deletion"}
          </button>
          {error ? (
            <p role="alert" className="text-[11px] text-[#d36a6a]">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder="Optional: tell us why you're leaving (max 500 characters). Stays in our analytics, not in your audit log."
            rows={3}
            className="w-full resize-none rounded border border-[#2A2A2A] bg-[#141414] px-2 py-1.5 text-[12px] text-[#E0E0E0] placeholder:text-[#444] focus:border-[#2D6A4F] focus:outline-none"
          />
          <button
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-2 rounded border border-[#3a1414] bg-[#1f0808] px-3 py-1.5 text-[12px] font-medium text-[#d36a6a] hover:bg-[#2f1010]"
          >
            <ShieldAlert size={12} aria-hidden /> Schedule deletion
          </button>
        </div>
      )}

      <ConfirmDestructiveDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Schedule account deletion"
        description={
          <>
            Your account is scheduled for deletion in <strong>7 days</strong>. You can cancel
            from this page during that window. After the window expires the deletion runs
            automatically and is irreversible.
          </>
        }
        confirmPhrase="DELETE MY ACCOUNT"
        confirmLabel="Schedule deletion"
        onConfirm={handleRequest}
      />
    </Section>
  );
}

function NotificationPreferencesStubSection(): React.ReactElement {
  const [quietMode, setQuietMode] = useState(false);

  return (
    <Section
      icon={<Bell size={16} className="text-[#40916C]" aria-hidden />}
      title="Notifications"
      description="Choose how Relay reaches you. Per-type preferences can be changed on the next page. A simple “quiet mode” switch is in progress for the pilot — the toggle below does not save to the server yet."
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded border border-[#2A2A2A] bg-[#0E0E0E] px-3 py-2.5">
          <div>
            <div className="text-[12px] font-medium text-[#E5E7EB]">Quiet mode (pilot placeholder)</div>
            <div className="mt-0.5 text-[10px] text-[#888]">
              When on, we intend to pause non-essential alerts. Not wired to the backend in this
              pilot — resets if you refresh.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={quietMode}
            aria-label="Quiet mode (pilot placeholder, not saved)"
            onClick={() => setQuietMode((v) => !v)}
            className={[
              "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
              quietMode
                ? "border-[#2D6A4F] bg-[#1B4332]"
                : "border-[#333] bg-[#1A1A1A]",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
                quietMode ? "left-5" : "left-0.5",
              ].join(" ")}
              aria-hidden
            />
          </button>
        </div>
        <p className="text-[10px] text-[#666]">
          <span className="font-medium text-[#888]">Pilot note:</span> only the detailed preferences
          page talks to Relay&apos;s API today. This switch is here so layout and copy can be reviewed
          before the global mute endpoint ships.
        </p>
        <Link
          href="/patron/notifications/preferences"
          className="inline-flex items-center gap-2 rounded border border-[#2A2A2A] bg-[#141414] px-3 py-1.5 text-[12px] text-[#bbb] hover:border-[#3A3A3A] hover:text-white"
        >
          <Bell size={12} aria-hidden /> Open detailed preferences
        </Link>
      </div>
    </Section>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  description,
  children
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="rounded-md border border-[#1F1F1F] bg-[#141414] p-4">
      <header className="mb-3 flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-[#E0E0E0]">{title}</h2>
          <p className="mt-1 text-[11px] text-[#888]">{description}</p>
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}

function Header(): React.ReactElement {
  return (
    <header className="border-b border-[#1F1F1F] px-6 py-4">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <Link
          href="/patron/feed"
          className="inline-flex items-center gap-1 text-xs text-[#888] underline-offset-2 hover:text-white hover:underline"
        >
          <ArrowLeft size={12} aria-hidden /> Feed
        </Link>
        <Settings size={16} className="text-[#40916C]" aria-hidden />
        <h1 className="text-base font-semibold">Settings</h1>
      </div>
    </header>
  );
}

function LoadingState(): React.ReactElement {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-xs text-[#666]">
      <Loader2 size={14} className="animate-spin" aria-hidden /> Loading settings…
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
    <div className="flex items-start gap-3 rounded-md border border-[#3a1414] bg-[#1f0808] p-4 text-xs text-[#d36a6a]">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1">
        <div className="mb-1 font-medium">Couldn{"'"}t load settings</div>
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
            Destructive actions mutate the local fixture only. Remove <code>?state=</code> to hit
            the live API.
          </div>
        </div>
      </div>
    </div>
  );
}

function gracePhrase(scheduledForIso: string): string {
  const ms = new Date(scheduledForIso).getTime() - Date.now();
  if (ms <= 0) return "The grace window has elapsed; the sweeper will execute on its next pass.";
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days <= 1) return "Less than a day remaining in the grace window.";
  return `${days} days remaining in the grace window.`;
}

function summariseCounts(counts: CreatorRelationshipDeletionCounts): string {
  const parts: string[] = [];
  if (counts.favorites) parts.push(`${counts.favorites} favorites`);
  if (counts.collections) {
    parts.push(`${counts.collections} collections (${counts.collectionEntries} entries)`);
  }
  if (counts.comments) parts.push(`${counts.comments} comments`);
  if (counts.commentReactions) parts.push(`${counts.commentReactions} reactions`);
  if (counts.contentReports) parts.push(`${counts.contentReports} reports`);
  if (counts.notifications) parts.push(`${counts.notifications} notifications`);
  if (parts.length === 0) return "no scoped data";
  return parts.join(", ");
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
