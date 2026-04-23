"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowRight,
  Loader2,
  Palette,
  Heart,
  Sparkles,
  Zap,
} from "lucide-react";
import { cn } from "@/app/lib/cn";
import { StudioSupabaseSignInPanel } from "@/app/components/studio/StudioSupabaseSignInPanel";
import { SupporterSignInPanel } from "@/app/components/auth/SupporterSignInPanel";
import { InstallExtensionPrompt } from "@/app/components/InstallExtensionPrompt";
import { PATREON_PATRON_OAUTH_SCOPES } from "@/lib/patreon-patron-scopes";
import { patronPatronOAuthRedirectUri } from "@/lib/patron-patron-redirect-uri";
import { encodePatronOAuthNonce } from "@/lib/patron-oauth-state";
import {
  RELAY_CREATOR_ID_STORAGE_KEY,
  RELAY_PUBLIC_SLUG_STORAGE_KEY,
  buildPatreonCreatorAuthorizeUrl,
  fetchCreatorPublicSlug,
  fetchPatronSessionIfPresent,
  getCreatorProfile,
  hasRelaySignedInCookie,
  patchCreatorProfile,
  patchCreatorPublicSlug,
  postCreatorWorkspace,
  postPatreonCreatorPrepare,
  RelayApiError,
  type CreatorProfileIdentity,
} from "@/lib/relay-api";
import RelayLogoAnimation from "@/app/components/relay-logo-animation";

export type OnboardingPath = "creator" | "supporter";

/* ───────────────────────────────────────────────────────────────────────────
 * Brand mark
 * ─────────────────────────────────────────────────────────────────────────── */

export function RelayWordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? 22 : size === "lg" ? 36 : 28;
  const text = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-lg";
  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 22 22"
        fill="none"
        aria-hidden
        className="flex-shrink-0"
      >
        <rect width="22" height="22" rx="5" fill="#1B4332" />
        <path
          d="M6 16V6h5.5a3.5 3.5 0 0 1 0 7H6M11.5 13l3.5 3"
          stroke="#40916C"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className={cn("font-semibold tracking-tight leading-none", text)}
        style={{ color: "var(--relay-gold-500)" }}
      >
        Relay
      </span>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Step 0 — Path picker (Creator vs Supporter)
 * ─────────────────────────────────────────────────────────────────────────── */

export function PathPicker({
  onChoose,
}: {
  onChoose: (path: OnboardingPath) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-10 text-center">
      <div className="flex flex-col items-center gap-5">
        <div
          className="h-32 w-32 shrink-0 sm:h-36 sm:w-36 max-w-[200px]"
          aria-hidden
        >
          <RelayLogoAnimation />
        </div>
        <div className="max-w-md space-y-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-[var(--relay-fg)] sm:text-4xl">
            Welcome to Relay
          </h1>
          <p className="text-base leading-relaxed text-[var(--relay-fg-muted)]">
            Are you here to share your work, or to support the artists you love?
          </p>
        </div>
      </div>

      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <PathCard
          label="I'm a Creator"
          description="Build a beautiful gallery for your art and reach your patrons."
          icon={<Palette className="h-6 w-6" strokeWidth={1.5} />}
          onClick={() => onChoose("creator")}
          accent="gold"
        />
        <PathCard
          label="I'm a Supporter"
          description="Find and follow the creators who make work you love."
          icon={<Heart className="h-6 w-6" strokeWidth={1.5} />}
          onClick={() => onChoose("supporter")}
          accent="green"
        />
      </div>

      <p className="text-sm text-[var(--relay-fg-muted)]">
        Already signed up?{" "}
        <Link
          href="/login"
          className="font-medium text-[var(--relay-green-400)] underline-offset-4 hover:underline"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}

function PathCard({
  label,
  description,
  icon,
  onClick,
  accent,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  accent: "gold" | "green";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-start gap-4 overflow-hidden rounded-2xl border bg-[var(--relay-surface-1)] p-6 text-left transition-all duration-200",
        "border-[var(--relay-border)] hover:-translate-y-0.5 hover:border-[var(--relay-green-600)] hover:shadow-[0_8px_30px_-12px_rgba(45,106,79,0.45)]"
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-xl border transition-colors",
          accent === "gold"
            ? "border-[var(--relay-gold-500)]/40 bg-[var(--relay-gold-500)]/10 text-[var(--relay-gold-400)]"
            : "border-[var(--relay-green-800)] bg-[var(--relay-green-950)] text-[var(--relay-green-400)]"
        )}
      >
        {icon}
      </div>
      <div className="space-y-1.5">
        <h3 className="text-lg font-semibold tracking-tight text-[var(--relay-fg)]">
          {label}
        </h3>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          {description}
        </p>
      </div>
      <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--relay-green-400)] transition-transform duration-200 group-hover:translate-x-0.5">
        Continue
        <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
      </span>
    </button>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Roadmap preview — forecasts the upcoming 3 steps so users know what's ahead
 * ─────────────────────────────────────────────────────────────────────────── */

export function RoadmapPreview({
  path,
  currentStep,
}: {
  path: OnboardingPath;
  currentStep: number;
}) {
  const items =
    path === "creator"
      ? [
          { n: 1, label: "Create your account" },
          { n: 2, label: "Connect Patreon" },
          { n: 3, label: "Set up your profile" },
          { n: 4, label: "Claim your gallery URL" },
        ]
      : [
          { n: 1, label: "Create your account" },
          { n: 2, label: "Connect Patreon" },
          { n: 3, label: "Open your feed" },
        ];

  return (
    <ol className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-[var(--relay-fg-muted)]">
      {items.map((it, idx) => {
        const active = it.n === currentStep;
        const done = it.n < currentStep;
        return (
          <li key={it.n} className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5",
                active && "text-[var(--relay-fg)]",
                done && "text-[var(--relay-green-400)]"
              )}
            >
              <span
                className={cn(
                  "inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold leading-none",
                  active
                    ? "border-[var(--relay-green-600)] bg-[var(--relay-green-600)] text-[var(--relay-fg)]"
                    : done
                      ? "border-[var(--relay-green-600)] bg-[var(--relay-green-600)]/20 text-[var(--relay-green-400)]"
                      : "border-[var(--relay-border)] text-[var(--relay-fg-muted)]"
                )}
              >
                {it.n}
              </span>
              {it.label}
            </span>
            {idx < items.length - 1 && (
              <span className="text-[var(--relay-border)]">→</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Step 1 — Sign up (path-aware wrapper around existing auth panels)
 * ─────────────────────────────────────────────────────────────────────────── */

export function StepSignUp({
  path,
  onSignedIn,
}: {
  path: OnboardingPath;
  onSignedIn?: () => void;
}) {
  const headline =
    path === "creator" ? "Make your gallery" : "Create your account";
  const subhead =
    path === "creator"
      ? "Spin up your Relay creator account in seconds. We'll send a quick email to verify it's really you."
      : "Get a verified Relay supporter account so you can follow your favorite creators.";

  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--relay-green-800)] bg-[var(--relay-green-950)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--relay-green-400)]">
          <Sparkles className="h-3 w-3" strokeWidth={2} />
          Step 1 of 3
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          {headline}
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          {subhead}
        </p>
        {path === "supporter" ? (
          <p className="rounded-md border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-2 text-xs leading-relaxed text-[var(--relay-fg-muted)]">
            <span className="font-medium text-[var(--relay-fg)]">Before step 2:</span> confirm
            your email from the message we send you. Patreon connect stays disabled until your
            inbox is verified — that keeps someone from linking Patreon to the wrong Relay
            account.
          </p>
        ) : null}
      </div>

      <Suspense
        fallback={
          <p className="text-center text-xs text-[var(--relay-fg-muted)]">
            Loading sign-in…
          </p>
        }
      >
        {path === "creator" ? (
          <StudioSupabaseSignInPanel
            variant="onboarding"
            onSuccess={onSignedIn}
          />
        ) : (
          <SupporterSignInPanel />
        )}
      </Suspense>

      <p className="text-center text-xs text-[var(--relay-fg-muted)]">
        We&apos;ll email you a magic link to verify the account. Check your inbox
        right after submitting.
      </p>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Step 2 — Connect Patreon (creator variant)
 * ─────────────────────────────────────────────────────────────────────────── */

const PatreonLogoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="14.5" cy="9.5" r="6.5" />
    <rect x="3" y="3" width="3.5" height="18" rx="1" />
  </svg>
);

export function StepConnectPatreonCreator({
  onSkip,
}: {
  onSkip?: () => void;
}) {
  const [origin, setOrigin] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    setHasSession(hasRelaySignedInCookie());
    setCreatorId(
      window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() ?? ""
    );
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

    let cid = creatorId;
    if (!cid || !hasSession) {
      try {
        const ws = await postCreatorWorkspace();
        cid = ws.relay_creator_id;
        window.localStorage.setItem(RELAY_CREATOR_ID_STORAGE_KEY, cid);
        setCreatorId(cid);
        setHasSession(true);
      } catch (e) {
        const msg =
          e instanceof RelayApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e);
        setError(`Could not create workspace: ${msg}`);
        setBusy(false);
        return;
      }
    }

    try {
      const prep = await postPatreonCreatorPrepare(cid);
      window.location.href = buildPatreonCreatorAuthorizeUrl(
        clientId,
        redirectUri,
        prep.state
      );
    } catch (e) {
      const msg =
        e instanceof RelayApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg);
      setBusy(false);
    }
  }, [clientId, redirectUri, creatorId, hasSession]);

  const missingClientId = !clientId;

  return (
    <PatreonStepShell
      step={2}
      title="Connect your Patreon"
      subhead="Authorize Relay to import your posts so we can stream your art straight into your gallery."
    >
      {missingClientId ? (
        <p className="rounded-md border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          Set{" "}
          <code className="rounded bg-black/30 px-1">
            NEXT_PUBLIC_PATREON_CLIENT_ID
          </code>{" "}
          in <code className="rounded bg-black/30 px-1">web/.env.local</code> to
          enable Patreon OAuth.
        </p>
      ) : (
        <button
          type="button"
          disabled={busy || !origin}
          onClick={() => void handleConnect()}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-4 py-4 text-sm font-medium text-[var(--relay-fg)] transition-all duration-150 hover:border-[var(--relay-green-600)] hover:bg-[var(--relay-green-950)] disabled:opacity-50"
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
              Continue with Patreon
            </>
          )}
        </button>
      )}

      {error && (
        <p className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      <p className="text-xs leading-relaxed text-[var(--relay-fg-muted)]">
        We&apos;ll bounce you to Patreon to authorize, then bring you right back to
        finish setting up.
      </p>

      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="mx-auto text-xs text-[var(--relay-fg-muted)] underline-offset-4 hover:text-[var(--relay-fg)] hover:underline"
        >
          Skip for now — I&apos;ll connect later
        </button>
      )}
    </PatreonStepShell>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Step 2 — Connect Patreon (supporter variant)
 * ─────────────────────────────────────────────────────────────────────────── */

export function StepConnectPatreonSupporter({
  initialClientId,
}: {
  initialClientId: string;
}) {
  const [sessionGate, setSessionGate] = useState<
    "loading" | "needs_signin" | "needs_verify_email" | "ready"
  >("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchPatronSessionIfPresent();
        if (cancelled) return;
        if (!me) {
          setSessionGate("needs_signin");
          return;
        }
        if (me.email_verified === false) {
          setSessionGate("needs_verify_email");
          return;
        }
        setSessionGate("ready");
      } catch {
        if (!cancelled) setSessionGate("needs_signin");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const redirectUri = patronPatronOAuthRedirectUri();
  const clientId = initialClientId;

  // Session-first /link path — nonce state (same as /patreon/patron/connect).
  const authorizeUrl = useMemo(() => {
    if (!clientId.trim() || !redirectUri) return "";
    const u = new URL("https://www.patreon.com/oauth2/authorize");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", clientId.trim());
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("scope", PATREON_PATRON_OAUTH_SCOPES);
    u.searchParams.set("state", encodePatronOAuthNonce());
    return u.toString();
  }, [clientId, redirectUri]);

  return (
    <PatreonStepShell
      step={2}
      title="Connect your Patreon"
      subhead="Sign in with Patreon so we can show you the creators and tiers you support. You need a verified email before this step (see step 1)."
    >
      {sessionGate === "loading" ? (
        <p className="text-center text-xs text-[var(--relay-fg-muted)]">
          Checking your Relay session…
        </p>
      ) : sessionGate === "needs_signin" ? (
        <p className="rounded-md border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          Sign in on{" "}
          <span className="font-medium text-amber-50">step 1</span> first, then come back here.{" "}
          <Link
            href="/login?role=supporter&returnTo=%2Fonboarding%3Fpath%3Dsupporter%26step%3D2"
            className="font-medium text-amber-200 underline-offset-2 hover:underline"
          >
            Open supporter sign-in
          </Link>
          .
        </p>
      ) : sessionGate === "needs_verify_email" ? (
        <div
          className="space-y-2 rounded-md border border-amber-800/50 bg-amber-950/35 px-3 py-3 text-xs text-amber-100"
          role="status"
        >
          <p>
            <span className="font-semibold text-amber-50">Confirm your email first.</span> We
            keep Patreon connect off until your inbox is verified — go back to step 1 or check
            your email for the confirmation link, then refresh this page.
          </p>
        </div>
      ) : !clientId.trim() ? (
        <p className="rounded-md border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          Set{" "}
          <code className="rounded bg-black/30 px-1">PATREON_CLIENT_ID</code> or{" "}
          <code className="rounded bg-black/30 px-1">
            NEXT_PUBLIC_PATREON_CLIENT_ID
          </code>{" "}
          in <code className="rounded bg-black/30 px-1">web/.env.local</code>.
        </p>
      ) : !redirectUri ? (
        <p className="text-center text-xs text-[var(--relay-fg-muted)]">
          Preparing Patreon link…
        </p>
      ) : (
        <a
          href={authorizeUrl}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-4 py-4 text-sm font-medium text-[var(--relay-fg)] transition-all duration-150 hover:border-[var(--relay-green-600)] hover:bg-[var(--relay-green-950)]"
        >
          <span className="text-[#f96854]">
            <PatreonLogoIcon />
          </span>
          Continue with Patreon
        </a>
      )}

      <p className="text-xs leading-relaxed text-[var(--relay-fg-muted)]">
        Once you authorize on Patreon, we&apos;ll bring you straight to your feed.
      </p>
    </PatreonStepShell>
  );
}

function PatreonStepShell({
  step,
  title,
  subhead,
  children,
}: {
  step: number;
  title: string;
  subhead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--relay-green-800)] bg-[var(--relay-green-950)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--relay-green-400)]">
          Step {step} of 3
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          {title}
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          {subhead}
        </p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Step 3 (creator) — Profile basics (APD-S4)
 *
 * Pre-fills display name / username / avatar from the creator profile (which is
 * itself lazy-filled from the Patreon CampaignDisplaySnapshot via
 * `promoteSnapshotToProfile`). One PATCH to /api/v1/creator/profile.
 *
 * Skippable: empty PATCH is a no-op; the user can finish the flow and edit
 * later from the Studio Profile page (APD-S3).
 * ─────────────────────────────────────────────────────────────────────────── */

const PROFILE_BIO_LIMIT = 280;

export function StepCreatorProfileBasics({
  onAdvance,
}: {
  onAdvance?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<CreatorProfileIdentity | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const prof = await getCreatorProfile();
        if (cancelled) return;
        setIdentity(prof);
        setDisplayName(prof.display_name ?? "");
        setUsername(prof.username ?? "");
        setAvatarUrl(prof.avatar_url ?? "");
        setBio(prof.bio ?? "");
      } catch (e) {
        if (cancelled) return;
        // 401/404 are fine — user may not have a creator workspace yet; just
        // start with empty fields and let them skip.
        if (!(e instanceof RelayApiError) || (e.status !== 401 && e.status !== 404)) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = (field: keyof CreatorProfileIdentity, current: string): boolean => {
    const original = (identity?.[field] as string | null) ?? "";
    return current.trim() !== original.trim();
  };

  const buildPatch = () => {
    const patch: Record<string, string | null> = {};
    if (isDirty("display_name", displayName)) {
      patch.display_name = displayName.trim() || null;
    }
    if (isDirty("username", username)) {
      patch.username = username.trim() || null;
    }
    if (isDirty("avatar_url", avatarUrl)) {
      patch.avatar_url = avatarUrl.trim() || null;
    }
    if (isDirty("bio", bio)) {
      patch.bio = bio.trim() || null;
    }
    return patch;
  };

  const handleSave = async () => {
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      onAdvance?.();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchCreatorProfile(patch);
      onAdvance?.();
    } catch (e) {
      const msg =
        e instanceof RelayApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg);
      setSaving(false);
    }
  };

  const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
  const bioCount = bio.length;
  const bioOver = bioCount > PROFILE_BIO_LIMIT;

  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--relay-green-800)] bg-[var(--relay-green-950)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--relay-green-400)]">
          <Palette className="h-3 w-3" strokeWidth={2} />
          Step 3 of 4 · Artists
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Set up your profile
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          {identity
            ? "We pulled what we could from Patreon — adjust whatever you want, or keep going and edit later."
            : "Add a display name, handle, and avatar so patrons recognize you."}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-[var(--relay-fg-muted)]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          Loading your profile…
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <label
              htmlFor="onboarding-display-name"
              className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]"
            >
              Display name
            </label>
            <input
              id="onboarding-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your studio or artist name"
              className="w-full rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-3 text-sm text-[var(--relay-fg)] placeholder-[var(--relay-fg-muted)] outline-none ring-[var(--relay-green-600)]/30 focus:ring-2"
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="onboarding-username"
              className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]"
            >
              Username
            </label>
            <div className="flex items-stretch overflow-hidden rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] focus-within:ring-2 focus-within:ring-[var(--relay-green-600)]/30">
              <span className="select-none border-r border-[var(--relay-border)] bg-[var(--relay-bg)] px-3 py-3 text-sm text-[var(--relay-fg-muted)]">
                @
              </span>
              <input
                id="onboarding-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="cool_artist_42"
                className="flex-1 bg-transparent px-3 py-3 text-sm text-[var(--relay-fg)] placeholder-[var(--relay-fg-muted)] focus:outline-none"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
            {sanitizedUsername && sanitizedUsername !== username.toLowerCase() ? (
              <p className="text-xs text-[var(--relay-fg-muted)]">
                Will be saved as{" "}
                <span className="text-[var(--relay-green-400)]">@{sanitizedUsername}</span>{" "}
                (lowercase, letters / numbers / underscores only).
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="onboarding-avatar"
              className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]"
            >
              Avatar URL
            </label>
            <div className="flex items-center gap-3">
              {avatarUrl.trim() ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={avatarUrl.trim()}
                  alt="Avatar preview"
                  className="h-12 w-12 shrink-0 rounded-full border border-[var(--relay-border)] object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
              ) : (
                <div
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--relay-border)] text-xs text-[var(--relay-fg-muted)]"
                >
                  ?
                </div>
              )}
              <input
                id="onboarding-avatar"
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://…"
                className="min-w-0 flex-1 rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-3 text-sm text-[var(--relay-fg)] placeholder-[var(--relay-fg-muted)] outline-none ring-[var(--relay-green-600)]/30 focus:ring-2"
                spellCheck={false}
              />
            </div>
            <p className="text-xs text-[var(--relay-fg-muted)]">
              Upload support is coming soon — for now, paste any image URL (Patreon, your
              site, etc).
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="onboarding-bio"
              className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]"
            >
              Short bio (optional)
            </label>
            <textarea
              id="onboarding-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="One or two sentences about your work."
              className="w-full resize-y rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-3 text-sm text-[var(--relay-fg)] placeholder-[var(--relay-fg-muted)] outline-none ring-[var(--relay-green-600)]/30 focus:ring-2"
            />
            <p
              className={cn(
                "text-right text-[10px]",
                bioOver
                  ? "text-red-400"
                  : "text-[var(--relay-fg-muted)]"
              )}
            >
              {bioCount} / {PROFILE_BIO_LIMIT}
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-200"
            >
              {error}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => onAdvance?.()}
          className="text-xs font-medium text-[var(--relay-fg-muted)] underline-offset-4 transition-colors hover:text-[var(--relay-fg)] hover:underline"
        >
          Skip for now
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={loading || saving || bioOver}
          className="flex items-center justify-center gap-2 rounded-xl bg-[var(--relay-green-600)] px-5 py-3 text-sm font-semibold text-[var(--relay-fg)] transition-colors hover:bg-[var(--relay-green-400)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            <>
              Save and continue
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Step 4 — Creator finish (claim public URL slug + extension prompt)
 * Persists via PATCH /api/v1/creator/public-slug (marks slug as user_chosen).
 * ─────────────────────────────────────────────────────────────────────────── */

function sanitizePublicSlugDraft(raw: string): string {
  let s = raw.toLowerCase().replace(/_/g, "-").replace(/[^a-z0-9-]+/g, "-");
  s = s.replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (s.length > 32) {
    s = s.slice(0, 32).replace(/-+$/g, "");
  }
  return s;
}

export function StepClaimHandleAndGo({
  onFinish,
}: {
  onFinish?: () => void;
}) {
  const [handle, setHandle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromPatreonHint, setFromPatreonHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      setLoading(true);
      const ls =
        typeof window !== "undefined"
          ? window.localStorage.getItem(RELAY_PUBLIC_SLUG_STORAGE_KEY)?.trim() ?? ""
          : "";
      try {
        let slugRes: { public_slug: string } | null = null;
        try {
          slugRes = await fetchCreatorPublicSlug();
        } catch {
          /* session or network — fall back to local hint */
        }
        let profile: CreatorProfileIdentity | null = null;
        try {
          profile = await getCreatorProfile();
        } catch {
          /* profile optional for URL prefill */
        }
        if (cancelled) return;
        const fromProfile =
          profile?.username_norm?.trim().replace(/_/g, "-").replace(/[^a-z0-9-]+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") ?? "";
        const serverSlug = slugRes?.public_slug?.trim() ?? "";
        const next =
          serverSlug ||
          (fromProfile.length >= 3 ? fromProfile : "") ||
          ls;
        setHandle(next);
        setFromPatreonHint(
          Boolean(profile?.username_norm?.trim()) && !serverSlug && !ls
        );
      } catch {
        if (!cancelled) {
          setHandle(ls);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sanitized = sanitizePublicSlugDraft(handle);
  const slugOk = sanitized.length >= 3 && sanitized.length <= 32;
  const previewPath =
    sanitized && slugOk ? `/patron/c/${encodeURIComponent(sanitized)}` : null;
  const previewAbsolute =
    typeof window !== "undefined" && previewPath
      ? `${window.location.origin}${previewPath}`
      : previewPath;

  const onSubmit = async () => {
    setError(null);
    if (!slugOk) {
      setError("Use 3–32 characters: lowercase letters, numbers, and hyphens only.");
      return;
    }
    setSaving(true);
    try {
      const r = await patchCreatorPublicSlug(sanitized);
      if (typeof window !== "undefined" && r.public_slug?.trim()) {
        window.localStorage.setItem(RELAY_PUBLIC_SLUG_STORAGE_KEY, r.public_slug.trim());
      }
      onFinish?.();
    } catch (e) {
      if (e instanceof RelayApiError) {
        if (e.status === 409) {
          setError("That URL is already taken. Try another.");
        } else {
          setError(e.message || "Could not save your URL.");
        }
      } else {
        setError(e instanceof Error ? e.message : "Could not save your URL.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--relay-green-800)] bg-[var(--relay-green-950)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--relay-green-400)]">
          <Zap className="h-3 w-3" strokeWidth={2} />
          Step 4 of 4 · Artists
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Claim your gallery URL
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          This is where patrons will discover your work.
          {fromPatreonHint
            ? " We suggested a path from your @username — edit if you like."
            : ""}
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="onboarding-handle"
          className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]"
        >
          Your gallery URL
        </label>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] transition-colors focus-within:border-[var(--relay-green-600)] focus-within:ring-1 focus-within:ring-[var(--relay-green-600)]/30">
          <span className="select-none border-r border-[var(--relay-border)] bg-[var(--relay-bg)] px-3 py-3 text-sm text-[var(--relay-fg-muted)]">
            …/patron/c/
          </span>
          <input
            id="onboarding-handle"
            type="text"
            value={handle}
            disabled={loading}
            onChange={(e) => {
              setHandle(e.target.value);
            }}
            placeholder="your-handle"
            aria-label="Public gallery URL slug"
            className="flex-1 bg-transparent px-3 py-3 text-sm text-[var(--relay-fg)] placeholder-[var(--relay-fg-muted)] focus:outline-none disabled:opacity-60"
          />
        </div>
        {loading ? (
          <p className="flex items-center gap-2 text-xs text-[var(--relay-fg-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Loading your URL…
          </p>
        ) : null}
        {previewAbsolute ? (
          <p className="text-xs text-[var(--relay-fg-muted)]">
            Preview:{" "}
            <span className="text-[var(--relay-green-400)]">{previewAbsolute}</span>
          </p>
        ) : null}
        {error ? (
          <p className="text-xs font-medium text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]">
          Pull in your gallery (optional)
        </span>
        <InstallExtensionPrompt
          variant="relay"
          title="Recommended — install the Relay browser extension"
        />
        <p className="text-xs leading-relaxed text-[var(--relay-fg-muted)]">
          Prefer to do it manually?{" "}
          <Link
            href="/patreon/cookie"
            className="font-medium text-[var(--relay-green-400)] underline-offset-4 hover:underline"
          >
            Walk through the cookie steps
          </Link>{" "}
          — about 60 seconds.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void onSubmit()}
        disabled={loading || saving || !slugOk}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--relay-green-600)] px-5 py-3 text-sm font-semibold text-[var(--relay-fg)] transition-colors hover:bg-[var(--relay-green-400)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Saving…
          </>
        ) : (
          <>
            Take me to my gallery
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </>
        )}
      </button>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Step 3 — Supporter finish (open feed)
 * ─────────────────────────────────────────────────────────────────────────── */

export function StepSupporterReady() {
  return (
    <div className="flex flex-col items-center gap-7 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--relay-green-800)] bg-[var(--relay-green-950)]">
        <Heart
          className="h-7 w-7 text-[var(--relay-green-400)]"
          strokeWidth={1.5}
        />
        <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-[var(--relay-green-400)]" />
      </div>
      <div className="max-w-sm space-y-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--relay-green-800)] bg-[var(--relay-green-950)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--relay-green-400)]">
          You&apos;re in
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Your feed is ready
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          Everything you support — in one beautiful, scrollable gallery. Open it
          up and start exploring.
        </p>
      </div>
      <Link
        href="/patron/feed"
        className="inline-flex items-center gap-2 rounded-xl bg-[var(--relay-green-600)] px-6 py-3 text-sm font-semibold text-[var(--relay-fg)] transition-colors hover:bg-[var(--relay-green-400)]"
      >
        Open my feed
        <ArrowRight className="h-4 w-4" strokeWidth={2} />
      </Link>
    </div>
  );
}
