"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Clock,
  Loader2,
  Settings,
  ShieldAlert,
  Undo2,
  User
} from "lucide-react";
import {
  cancelPatronAccountDeletion,
  getPendingPatronAccountDeletion,
  requestPatronAccountDeletion,
  type PendingDeletion
} from "@/lib/relay-api";
import {
  fetchPatronProfileMe,
  patchPatronProfileMe,
  resolvedPatronDigestTimezone,
  PATRON_PROFILE_BIO_UI_LIMIT,
  PATRON_PROFILE_DISPLAY_NAME_LIMIT,
  type PatronProfileMe,
} from "@/lib/patron-profile-api";
import { ConfirmDestructiveDialog } from "@/app/components/ConfirmDestructiveDialog";
import {
  digestCadenceFromProfile,
  digestSlotFromProfile,
  NotificationDigestPreferencesForm,
} from "@/components/patron/NotificationDigestPreferencesForm";
import type {
  NotificationCadencePreferenceId,
  NotificationDigestSlotId,
} from "@/lib/notification-digest-preferences";

// ─── Dev fixtures ─────────────────────────────────────────────────────────────

type ViewState = "live" | "loading" | "empty" | "error" | "pending-deletion";

const DEV_OVERRIDES = new Set<ViewState>(["empty", "error", "pending-deletion"]);

function devToolsEnabled(): boolean {
  return (
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "")
      .toString()
      .toLowerCase() === "true"
  );
}

const FIXTURE_PENDING: PendingDeletion = {
  id: "del-fixture",
  requested_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  scheduled_for: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
  reason: "fixture preview"
};

interface Fixture {
  pending: PendingDeletion | null;
  errored: boolean;
}

function fixtureFor(state: ViewState): Fixture {
  if (state === "empty") return { pending: null, errored: false };
  if (state === "error") return { pending: null, errored: true };
  if (state === "pending-deletion") {
    return { pending: FIXTURE_PENDING, errored: false };
  }
  return { pending: null, errored: false };
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

  const [pending, setPending] = useState<PendingDeletion | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (devState !== null) {
      const fx = fixtureFor(devState);
      setPending(fx.pending);
      setPhase(fx.errored ? "error" : "ready");
      setErrorMessage(fx.errored ? "Simulated settings error." : null);
      return;
    }
    setPhase("loading");
    setErrorMessage(null);
    try {
      const pendingRes = await getPendingPatronAccountDeletion();
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
            <ProfileSection devMode={devState !== null} />
            <ContentPreferencesSection devMode={devState !== null} />
            <NotificationDigestSection devMode={devState !== null} />
            <AccountDeletionSection
              pending={pending}
              devMode={devState !== null}
              onPendingChange={setPending}
            />
          </>
        ) : null}
      </main>
    </div>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function ProfileSection({ devMode }: { devMode: boolean }): React.ReactElement {
  const [loading, setLoading] = useState(!devMode);
  const [saving, setSaving] = useState(false);
  const [savedProfile, setSavedProfile] = useState<PatronProfileMe | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (devMode) return;
    let cancelled = false;
    void fetchPatronProfileMe()
      .then((profile) => {
        if (cancelled) return;
        setSavedProfile(profile);
        setDisplayName(profile.display_name ?? "");
        setBio(profile.bio ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [devMode]);

  const displayNameDirty =
    displayName.trim() !== (savedProfile?.display_name ?? "").trim();
  const bioDirty = bio.trim() !== (savedProfile?.bio ?? "").trim();
  const dirty = displayNameDirty || bioDirty;
  const bioOver = bio.length > PATRON_PROFILE_BIO_UI_LIMIT;
  const displayNameOver = displayName.length > PATRON_PROFILE_DISPLAY_NAME_LIMIT;
  const canSave = dirty && !bioOver && !displayNameOver && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await patchPatronProfileMe({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
      });
      setSavedProfile(updated);
      setDisplayName(updated.display_name ?? "");
      setBio(updated.bio ?? "");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleLabel = savedProfile?.handle?.trim();

  return (
    <Section
      icon={<User size={16} className="text-[#40916C]" aria-hidden />}
      title="Profile"
      description="How you appear on your profile. Your Relay username is what others use to @mention you."
    >
      {devMode ? (
        <p className="text-[11px] text-[#888]">
          Profile editing uses the live API. Remove <code>?state=</code> from the URL to load and
          save your profile.
        </p>
      ) : loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-[#666]">
          <Loader2 size={12} className="animate-spin" aria-hidden /> Loading profile…
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="patron-settings-username"
              className="text-[10px] uppercase tracking-wide text-[#666]"
            >
              Relay username
            </label>
            <span
              id="patron-settings-username"
              className="inline-flex rounded border border-[#2A2A2A] bg-[#0E0E0E] px-2.5 py-1 font-mono text-[12px] text-[#9bf0c4]"
            >
              {handleLabel ? `@${handleLabel}` : "Not set"}
            </span>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="patron-settings-display-name" className="text-[10px] uppercase tracking-wide text-[#666]">
              Display name
            </label>
            <input
              id="patron-settings-display-name"
              type="text"
              value={displayName}
              maxLength={PATRON_PROFILE_DISPLAY_NAME_LIMIT}
              onChange={(e) => {
                setSuccess(false);
                setDisplayName(e.target.value);
              }}
              placeholder="How your name appears on your profile"
              className="w-full rounded border border-[#2A2A2A] bg-[#141414] px-2 py-1.5 text-[12px] text-[#E0E0E0] placeholder:text-[#444] focus:border-[#2D6A4F] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="patron-settings-bio" className="text-[10px] uppercase tracking-wide text-[#666]">
              Bio
            </label>
            <textarea
              id="patron-settings-bio"
              value={bio}
              rows={4}
              onChange={(e) => {
                setSuccess(false);
                setBio(e.target.value.slice(0, PATRON_PROFILE_BIO_UI_LIMIT));
              }}
              placeholder="A short line about you (optional)"
              className={[
                "w-full resize-none rounded border bg-[#141414] px-2 py-1.5 text-[12px] text-[#E0E0E0] placeholder:text-[#444] focus:outline-none",
                bioOver ? "border-[#5a2424]" : "border-[#2A2A2A] focus:border-[#2D6A4F]",
              ].join(" ")}
            />
            <p className={["text-[10px]", bioOver ? "text-[#d36a6a]" : "text-[#555]"].join(" ")}>
              {bio.length} / {PATRON_PROFILE_BIO_UI_LIMIT}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded border border-[#2D6A4F] bg-[#1B4332] px-3 py-1.5 text-[12px] font-medium text-[#9bf0c4] hover:bg-[#244f3a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
            {saving ? "Saving…" : "Save profile"}
          </button>

          {success ? (
            <p className="text-[11px] text-[#9bf0c4]">Profile saved.</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-[11px] text-[#d36a6a]">
              {error}
            </p>
          ) : null}
        </div>
      )}
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

function ContentPreferencesSection({ devMode }: { devMode: boolean }): React.ReactElement {
  const [loading, setLoading] = useState(!devMode);
  const [saving, setSaving] = useState(false);
  const [hideMature, setHideMature] = useState(false);
  const [savedHideMature, setSavedHideMature] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (devMode) return;
    let cancelled = false;
    void fetchPatronProfileMe()
      .then((profile) => {
        if (cancelled) return;
        setHideMature(profile.hide_mature_content);
        setSavedHideMature(profile.hide_mature_content);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [devMode]);

  const dirty = hideMature !== savedHideMature;
  const canSave = dirty && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await patchPatronProfileMe({ hide_mature_content: hideMature });
      setHideMature(updated.hide_mature_content);
      setSavedHideMature(updated.hide_mature_content);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      icon={<ShieldAlert size={16} className="text-[#40916C]" aria-hidden />}
      title="Content preferences"
      description="Control how mature posts appear across your patron experience."
    >
      {devMode ? (
        <p className="text-[11px] text-[#888]">
          Content preferences use the live API. Remove <code>?state=</code> from the URL to load and
          save your preferences.
        </p>
      ) : loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-[#666]">
          <Loader2 size={12} className="animate-spin" aria-hidden /> Loading content preferences…
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={hideMature}
              disabled={saving}
              onChange={(e) => {
                setSuccess(false);
                setHideMature(e.target.checked);
              }}
              className="mt-0.5 h-4 w-4 rounded border-[#2A2A2A] bg-[#141414] accent-[#2D6A4F]"
            />
            <span className="min-w-0">
              <span className="block text-[12px] font-medium text-[#E0E0E0]">Hide 18+ content</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[#888]">
                Mature posts will be hidden from your feed entirely.
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded border border-[#2D6A4F] bg-[#1B4332] px-3 py-1.5 text-[12px] font-medium text-[#9bf0c4] hover:bg-[#244f3a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
            {saving ? "Saving…" : "Save content preferences"}
          </button>

          {success ? (
            <p className="text-[11px] text-[#9bf0c4]">Content preferences saved.</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-[11px] text-[#d36a6a]">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Section>
  );
}

function NotificationDigestSection({ devMode }: { devMode: boolean }): React.ReactElement {
  const [loading, setLoading] = useState(!devMode);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [cadence, setCadence] = useState<NotificationCadencePreferenceId>("weekly");
  const [slot, setSlot] = useState<NotificationDigestSlotId>("evening");
  const [savedEnabled, setSavedEnabled] = useState(true);
  const [savedCadence, setSavedCadence] = useState<NotificationCadencePreferenceId>("weekly");
  const [savedSlot, setSavedSlot] = useState<NotificationDigestSlotId>("evening");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (devMode) return;
    let cancelled = false;
    void fetchPatronProfileMe()
      .then((profile) => {
        if (cancelled) return;
        const nextEnabled = profile.notification_digest_enabled;
        const nextCadence = digestCadenceFromProfile(profile.notification_digest_cadence);
        const nextSlot = digestSlotFromProfile(profile.notification_digest_slot);
        setEnabled(nextEnabled);
        setCadence(nextCadence);
        setSlot(nextSlot);
        setSavedEnabled(nextEnabled);
        setSavedCadence(nextCadence);
        setSavedSlot(nextSlot);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [devMode]);

  const dirty =
    enabled !== savedEnabled || cadence !== savedCadence || slot !== savedSlot;
  const canSave = dirty && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await patchPatronProfileMe({
        notification_digest_enabled: enabled,
        notification_digest_cadence: cadence,
        notification_digest_slot: slot,
        notification_digest_timezone: resolvedPatronDigestTimezone(null),
      });
      const nextEnabled = updated.notification_digest_enabled;
      const nextCadence = digestCadenceFromProfile(updated.notification_digest_cadence);
      const nextSlot = digestSlotFromProfile(updated.notification_digest_slot);
      setEnabled(nextEnabled);
      setCadence(nextCadence);
      setSlot(nextSlot);
      setSavedEnabled(nextEnabled);
      setSavedCadence(nextCadence);
      setSavedSlot(nextSlot);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      icon={<Bell size={16} className="text-[#40916C]" aria-hidden />}
      title="Notifications"
      description="Choose immediate alerts, scheduled batches, or browse without email updates."
    >
      {devMode ? (
        <p className="text-[11px] text-[#888]">
          Notification digest preferences use the live API. Remove <code>?state=</code> from the URL
          to load and save your preferences.
        </p>
      ) : loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-[#666]">
          <Loader2 size={12} className="animate-spin" aria-hidden /> Loading notification preferences…
        </div>
      ) : (
        <div className="space-y-4">
          <NotificationDigestPreferencesForm
            digestEnabled={enabled}
            cadence={cadence}
            slot={slot}
            disabled={saving}
            onDigestEnabledChange={(next) => {
              setSuccess(false);
              setEnabled(next);
            }}
            onCadenceChange={(next) => {
              setSuccess(false);
              setCadence(next);
            }}
            onSlotChange={(next) => {
              setSuccess(false);
              setSlot(next);
            }}
          />

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded border border-[#2D6A4F] bg-[#1B4332] px-3 py-1.5 text-[12px] font-medium text-[#9bf0c4] hover:bg-[#244f3a] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
            {saving ? "Saving…" : "Save notification preferences"}
          </button>

          {success ? (
            <p className="text-[11px] text-[#9bf0c4]">Notification preferences saved.</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-[11px] text-[#d36a6a]">
              {error}
            </p>
          ) : null}
        </div>
      )}
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
          href="/feed"
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
