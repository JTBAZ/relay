"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Zap } from "lucide-react";
import { cn } from "@/app/lib/cn";
import { StudioSupabaseSignInPanel } from "@/app/components/studio/StudioSupabaseSignInPanel";
import { InstallExtensionPrompt } from "@/app/components/InstallExtensionPrompt";
import {
  RELAY_CREATOR_ID_STORAGE_KEY,
  RELAY_PUBLIC_SLUG_STORAGE_KEY,
  buildPatreonCreatorAuthorizeUrl,
  hasRelaySignedInCookie,
  postCreatorWorkspace,
  postPatreonCreatorPrepare,
  RelayApiError,
} from "@/lib/relay-api";

export function StepWelcome() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--relay-green-800)] bg-[var(--relay-green-950)]">
        <Sparkles className="h-7 w-7 text-[var(--relay-green-400)]" strokeWidth={1.5} />
      </div>
      <div className="max-w-sm space-y-2">
        <h2 className="text-balance text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Welcome to Relay
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          Your all-in-one platform for building lasting connections with your audience.
          We&apos;ll have you set up in about two minutes.
        </p>
      </div>
      <ul className="w-full max-w-xs space-y-3 text-left">
        {["Unified patron management", "Real-time earnings insights", "Direct messaging & drops"].map(
          (item) => (
            <li key={item} className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--relay-green-400)]" />
              <span className="text-sm text-[var(--relay-fg-muted)]">{item}</span>
            </li>
          )
        )}
      </ul>
    </div>
  );
}

/** MT-036: Welcome copy plus Supabase sign-in → Relay session → workspace. */
export function StepWelcomeWithStudio({ onSignedIn }: { onSignedIn?: () => void }) {
  return (
    <div className="flex flex-col gap-8">
      <StepWelcome />
      <Suspense fallback={<p className="text-center text-xs text-[var(--relay-fg-muted)]">Loading sign-in…</p>}>
        <StudioSupabaseSignInPanel variant="onboarding" onSuccess={onSignedIn} />
      </Suspense>
    </div>
  );
}

export function StepProfile() {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [category, setCategory] = useState("");

  const categories = ["Music", "Art & Design", "Writing", "Podcasting", "Video", "Gaming"];

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Set up your profile
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          This is how patrons will discover and identify you on Relay.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name or alias"
            className="w-full rounded-md border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-2.5 text-sm text-[var(--relay-fg)] placeholder-[var(--relay-fg-muted)] transition-colors focus:border-[var(--relay-green-600)] focus:outline-none focus:ring-1 focus:ring-[var(--relay-green-600)]/30"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]">
            Handle
          </label>
          <div className="flex items-center gap-0 overflow-hidden rounded-md border border-[var(--relay-border)] bg-[var(--relay-surface-1)] transition-colors focus-within:border-[var(--relay-green-600)] focus-within:ring-1 focus-within:ring-[var(--relay-green-600)]/30">
            <span className="select-none border-r border-[var(--relay-border)] bg-[var(--relay-bg)] px-3 py-2.5 text-sm text-[var(--relay-fg-muted)]">
              relay.so/
            </span>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="yourhandle"
              className="flex-1 bg-transparent px-3 py-2.5 text-sm text-[var(--relay-fg)] placeholder-[var(--relay-fg-muted)] focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]">
            Creator Category
          </label>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150",
                  category === cat
                    ? "border-[var(--relay-green-600)] bg-[var(--relay-green-800)] text-[var(--relay-fg)]"
                    : "border-[var(--relay-border)] bg-[var(--relay-surface-1)] text-[var(--relay-fg-muted)] hover:border-[var(--relay-green-600)]/50 hover:text-[var(--relay-fg)]"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const PatreonLogoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="14.5" cy="9.5" r="6.5" />
    <rect x="3" y="3" width="3.5" height="18" rx="1" />
  </svg>
);

export function StepPatreonConnect() {
  const [origin, setOrigin] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    setHasSession(hasRelaySignedInCookie());
    setCreatorId(window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() ?? "");
  }, []);

  const clientId = (
    process.env.NEXT_PUBLIC_PATREON_CLIENT_ID ||
    process.env.PATREON_CLIENT_ID ||
    ""
  ).trim();

  const redirectUri = useMemo(() => {
    const fromEnv = process.env.NEXT_PUBLIC_PATREON_REDIRECT_URI?.trim();
    return fromEnv || (origin ? `${origin}/patreon/callback` : "");
  }, [origin]);

  const handleConnect = useCallback(async () => {
    if (!clientId || !redirectUri) {
      setError("Patreon Client ID or redirect URI is missing — check env config.");
      return;
    }
    setError(null);
    setBusy(true);

    // Ensure workspace exists first
    let cid = creatorId;
    if (!cid || !hasSession) {
      try {
        const ws = await postCreatorWorkspace();
        cid = ws.relay_creator_id;
        window.localStorage.setItem(RELAY_CREATOR_ID_STORAGE_KEY, cid);
        setCreatorId(cid);
        setHasSession(true);
      } catch (e) {
        const msg = e instanceof RelayApiError ? e.message : e instanceof Error ? e.message : String(e);
        setError(`Could not create workspace: ${msg}`);
        setBusy(false);
        return;
      }
    }

    try {
      const prep = await postPatreonCreatorPrepare(cid);
      window.location.href = buildPatreonCreatorAuthorizeUrl(clientId, redirectUri, prep.state);
    } catch (e) {
      const msg = e instanceof RelayApiError ? e.message : e instanceof Error ? e.message : String(e);
      setError(msg);
      setBusy(false);
    }
  }, [clientId, redirectUri, creatorId, hasSession]);

  const missingClientId = !clientId;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Connect Patreon
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          Link your Patreon account to sync your posts, patron list, and tiers into Relay.
        </p>
      </div>

      {missingClientId ? (
        <p className="rounded-md border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          Set <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_PATREON_CLIENT_ID</code> in{" "}
          <code className="rounded bg-black/30 px-1">web/.env.local</code> to enable Patreon OAuth.
        </p>
      ) : (
        <button
          type="button"
          disabled={busy || !origin}
          onClick={() => void handleConnect()}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-4 py-4 text-sm font-medium text-[var(--relay-fg)] transition-all duration-150 hover:border-[var(--relay-green-600)] hover:bg-[var(--relay-green-950)] disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Redirecting to Patreon…
            </>
          ) : (
            <>
              <span className="text-[#f96854]">
                <PatreonLogoIcon />
              </span>
              Connect Patreon account
            </>
          )}
        </button>
      )}

      {error && (
        <p className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      <InstallExtensionPrompt variant="relay" />

      <p className="text-xs text-[var(--relay-fg-muted)]">
        You&apos;ll be redirected to Patreon to authorize access, then brought back here.
        You can also skip this step and connect later from your dashboard.
      </p>
    </div>
  );
}

export function StepGoLive() {
  const [publicProfilePath, setPublicProfilePath] = useState<string | null>(null);

  useEffect(() => {
    const slug = typeof window !== "undefined"
      ? window.localStorage.getItem(RELAY_PUBLIC_SLUG_STORAGE_KEY)?.trim()
      : null;
    setPublicProfilePath(slug ? `/patron/c/${encodeURIComponent(slug)}` : null);
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--relay-green-800)] bg-[var(--relay-green-950)]">
        <Zap className="h-7 w-7 text-[var(--relay-green-400)]" strokeWidth={1.5} />
        <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-[var(--relay-green-400)]" />
      </div>
      <div className="max-w-sm space-y-2">
        <h2 className="text-balance text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          You&apos;re all set
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          Open your Library to sync Patreon and manage posts. When you&apos;re ready, share your public gallery
          link with patrons.
        </p>
      </div>

      {publicProfilePath ? (
        <p className="max-w-sm text-xs text-[var(--relay-fg-muted)]">
          <Link
            href={publicProfilePath}
            className="font-medium text-[var(--relay-green-400)] underline-offset-2 hover:underline"
          >
            Preview your public gallery
          </Link>
        </p>
      ) : null}

      <div className="w-full max-w-xs space-y-2 text-left">
        {[
          { label: "Profile created", done: true },
          { label: "Platforms connected", done: true },
          { label: "First drop waiting", done: false }
        ].map(({ label, done }) => (
          <div key={label} className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full",
                done ? "bg-[var(--relay-green-600)]" : "border border-[var(--relay-border)] bg-[var(--relay-surface-2)]"
              )}
            >
              {done && (
                <svg className="h-2.5 w-2.5" viewBox="0 0 10 8" fill="none" aria-hidden>
                  <path
                    d="M1 4l3 3 5-6"
                    stroke="#F9FAFB"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
            <span className={cn("text-sm", done ? "text-[var(--relay-fg)]" : "text-[var(--relay-fg-muted)]")}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
