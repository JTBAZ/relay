"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Check,
  Loader2,
  Settings
} from "lucide-react";
import {
  listPatronNotificationPreferences,
  setPatronNotificationPreference,
  type NotificationKind,
  type NotificationPreferenceRecord
} from "@/lib/relay-api";

// ─── Canonical preference catalog ─────────────────────────────────────────────
//
// The backend treats `preference_type` as a free-form string today (see
// notification-prefs-service.ts header) so the UI declares the canonical set here. New types
// added to the backend mapper get one row in this list and they show up automatically.

const PREFERENCE_TYPES: ReadonlyArray<{
  key: NotificationKind;
  label: string;
  description: string;
}> = [
  {
    key: "comment_replied",
    label: "Replies to my comments",
    description: "Someone replies to a comment you wrote."
  },
  {
    key: "comment_liked",
    label: "Reactions on my comments",
    description: "Someone likes / hearts / laughs at a comment you wrote."
  },
  {
    key: "new_follower",
    label: "New followers",
    description: "Someone follows your patron account."
  },
  {
    key: "tier_changed",
    label: "Tier changes",
    description: "Your tier on a creator changes (upgrade, downgrade, lapse)."
  },
  {
    key: "new_post_followed",
    label: "New posts from creators I follow",
    description: "A creator you follow publishes a new post."
  },
  {
    key: "mention",
    label: "@-mentions",
    description: "Someone mentions you in a comment."
  }
];

// ─── Dev fixtures ─────────────────────────────────────────────────────────────

type ViewState = "live" | "loading" | "mixed" | "empty" | "error";

const DEV_OVERRIDES = new Set<ViewState>(["mixed", "empty", "error"]);

function devToolsEnabled(): boolean {
  return (
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "")
      .toString()
      .toLowerCase() === "true"
  );
}

const NOW_ISO = new Date().toISOString();

const FIXTURE_PREFS: NotificationPreferenceRecord[] = [
  {
    relayCreatorId: "creator-aurora",
    preferenceType: "comment_replied",
    enabled: true,
    updatedAt: NOW_ISO
  },
  {
    relayCreatorId: "creator-aurora",
    preferenceType: "comment_liked",
    enabled: false,
    updatedAt: NOW_ISO
  },
  {
    relayCreatorId: "creator-aurora",
    preferenceType: "tier_changed",
    enabled: true,
    updatedAt: NOW_ISO
  },
  {
    relayCreatorId: "creator-mistwood",
    preferenceType: "new_post_followed",
    enabled: false,
    updatedAt: NOW_ISO
  }
];

function fixtureFor(state: ViewState): NotificationPreferenceRecord[] {
  if (state === "empty") return [];
  return FIXTURE_PREFS;
}

// ─── Page client ──────────────────────────────────────────────────────────────

interface CreatorGroup {
  relayCreatorId: string;
  /** Map of preference_type -> persisted record (when present). */
  byType: Map<string, NotificationPreferenceRecord>;
}

function groupByCreator(items: NotificationPreferenceRecord[]): CreatorGroup[] {
  const map = new Map<string, CreatorGroup>();
  for (const item of items) {
    const key = item.relayCreatorId;
    let group = map.get(key);
    if (!group) {
      group = { relayCreatorId: key, byType: new Map() };
      map.set(key, group);
    }
    group.byType.set(item.preferenceType, item);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.relayCreatorId.localeCompare(b.relayCreatorId)
  );
}

export function PatronNotificationPreferencesClient(): React.ReactElement {
  const searchParams = useSearchParams();
  const requested = searchParams.get("state");
  const isDevState =
    devToolsEnabled() &&
    typeof requested === "string" &&
    DEV_OVERRIDES.has(requested as ViewState);
  const devState = isDevState ? (requested as ViewState) : null;

  const [items, setItems] = useState<NotificationPreferenceRecord[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (devState !== null) {
      setItems(fixtureFor(devState));
      setPhase(devState === "error" ? "error" : "ready");
      setErrorMessage(devState === "error" ? "Simulated preferences error." : null);
      return;
    }
    setPhase("loading");
    setErrorMessage(null);
    try {
      const result = await listPatronNotificationPreferences();
      setItems(result.items);
      setPhase("ready");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [devState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const groups = useMemo(() => groupByCreator(items), [items]);

  const handleToggle = async (
    relayCreatorId: string,
    preferenceType: string,
    enabled: boolean
  ) => {
    const key = `${relayCreatorId}\0${preferenceType}`;
    setSavingKey(key);
    try {
      if (devState !== null) {
        // Dev fixture mutation: append-or-update locally.
        setItems((prev) => {
          const idx = prev.findIndex(
            (p) => p.relayCreatorId === relayCreatorId && p.preferenceType === preferenceType
          );
          const next = [...prev];
          const row: NotificationPreferenceRecord = {
            relayCreatorId,
            preferenceType,
            enabled,
            updatedAt: new Date().toISOString()
          };
          if (idx === -1) {
            next.push(row);
          } else {
            next[idx] = row;
          }
          return next;
        });
        return;
      }
      const updated = await setPatronNotificationPreference({
        relayCreatorId,
        preferenceType,
        enabled
      });
      setItems((prev) => {
        const idx = prev.findIndex(
          (p) => p.relayCreatorId === relayCreatorId && p.preferenceType === preferenceType
        );
        const next = [...prev];
        if (idx === -1) {
          next.push(updated);
        } else {
          next[idx] = updated;
        }
        return next;
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setPhase("error");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0E0E0]">
      <Header />
      {devState ? <DevStateBanner state={devState} /> : null}

      <main className="mx-auto max-w-3xl px-6 pb-12 pt-4">
        {phase === "loading" ? <LoadingState /> : null}
        {phase === "error" ? (
          <ErrorState message={errorMessage ?? "Failed to load preferences."} onRetry={refresh} />
        ) : null}

        {phase === "ready" ? (
          <>
            <DefaultPolicyNote />
            {groups.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="mt-4 space-y-4">
                {groups.map((group) => (
                  <CreatorGroupCard
                    key={group.relayCreatorId}
                    group={group}
                    savingKey={savingKey}
                    onToggle={handleToggle}
                  />
                ))}
              </ul>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function Header(): React.ReactElement {
  return (
    <header className="border-b border-[#1F1F1F] px-6 py-4">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <Link
          href="/patron/notifications"
          className="inline-flex items-center gap-1 text-xs text-[#888] underline-offset-2 hover:text-white hover:underline"
        >
          <ArrowLeft size={12} aria-hidden /> Inbox
        </Link>
        <Settings size={16} className="text-[#40916C]" aria-hidden />
        <h1 className="text-base font-semibold">Notification preferences</h1>
      </div>
    </header>
  );
}

function DefaultPolicyNote(): React.ReactElement {
  return (
    <div className="rounded-md border border-[#2A2A2A] bg-[#141414] p-3 text-[11px] text-[#888]">
      <Bell size={12} className="mr-1 inline text-[#40916C]" aria-hidden />
      All notification kinds are <span className="text-[#bbb]">on</span> by default. Toggle a
      kind off to mute it for that creator scope; rows you{"'"}ve never touched stay on the
      default.
    </div>
  );
}

function CreatorGroupCard({
  group,
  savingKey,
  onToggle
}: {
  group: CreatorGroup;
  savingKey: string | null;
  onToggle: (relayCreatorId: string, preferenceType: string, enabled: boolean) => Promise<void>;
}): React.ReactElement {
  return (
    <li className="rounded-md border border-[#1F1F1F] bg-[#141414]">
      <div className="border-b border-[#1F1F1F] px-3 py-2 text-[11px] uppercase tracking-wide text-[#888]">
        {group.relayCreatorId.length > 0 ? group.relayCreatorId : "Account-wide"}
      </div>
      <ul className="divide-y divide-[#1F1F1F]">
        {PREFERENCE_TYPES.map((spec) => {
          const persisted = group.byType.get(spec.key);
          const enabled = persisted?.enabled ?? true;
          const key = `${group.relayCreatorId}\0${spec.key}`;
          const saving = savingKey === key;
          const isDefault = persisted === undefined;
          return (
            <li key={spec.key} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-[#E0E0E0]">{spec.label}</span>
                  {isDefault ? (
                    <span className="rounded-full border border-[#2A2A2A] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[#666]">
                      default
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[11px] text-[#666]">{spec.description}</p>
              </div>
              <ToggleButton
                enabled={enabled}
                saving={saving}
                onChange={(next) => void onToggle(group.relayCreatorId, spec.key, next)}
              />
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function ToggleButton({
  enabled,
  saving,
  onChange
}: {
  enabled: boolean;
  saving: boolean;
  onChange: (next: boolean) => void;
}): React.ReactElement {
  return (
    <button
      onClick={() => onChange(!enabled)}
      disabled={saving}
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Mute this notification kind" : "Enable this notification kind"}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        enabled ? "bg-[#2D6A4F]" : "bg-[#2A2A2A]",
        saving ? "opacity-60" : "hover:opacity-90"
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
          enabled ? "translate-x-5" : "translate-x-1"
        ].join(" ")}
        aria-hidden
      />
      {saving ? (
        <Loader2
          size={9}
          className="absolute inset-0 m-auto animate-spin text-white/70"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

function LoadingState(): React.ReactElement {
  return (
    <div className="mt-8 flex items-center justify-center gap-2 text-xs text-[#666]">
      <Loader2 size={14} className="animate-spin" aria-hidden /> Loading preferences…
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
        <div className="mb-1 font-medium">Couldn{"'"}t load preferences</div>
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

function EmptyState(): React.ReactElement {
  return (
    <div className="mx-auto mt-8 max-w-md rounded-md border border-[#2A2A2A] bg-[#141414] p-6 text-center text-xs text-[#888]">
      <Check size={20} aria-hidden className="mx-auto mb-2 text-[#40916C]/60" />
      <div className="font-medium text-[#E0E0E0]">All defaults.</div>
      <div className="mt-1 text-[11px] text-[#666]">
        You haven{"'"}t muted anything yet — every notification kind is on for every creator.
        Toggle
        one off below to record a preference.
      </div>
      <p className="mt-3 text-[10px] text-[#555]">
        (Per-creator preference rows will appear here once you make a selection.)
      </p>
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
            Toggles mutate the local fixture only. Remove <code>?state=</code> to hit the live API.
          </div>
        </div>
      </div>
    </div>
  );
}
