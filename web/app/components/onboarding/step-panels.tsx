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
  Camera,
  X,
  Loader2,
  Palette,
  Heart,
  Sparkles,
  Zap,
  Compass,
} from "lucide-react";
import { cn } from "@/app/lib/cn";
import { StudioSupabaseSignInPanel } from "@/app/components/studio/StudioSupabaseSignInPanel";
import { SupporterSignInPanel } from "@/app/components/auth/SupporterSignInPanel";
import { InstallExtensionPrompt } from "@/app/components/InstallExtensionPrompt";
import { PATREON_PATRON_OAUTH_SCOPES } from "@/lib/patreon-patron-scopes";
import { setPendingOAuthCallbackTarget } from "@/lib/oauth-pending-callback";
import { patronPatronOAuthRedirectUri } from "@/lib/patron-patron-redirect-uri";
import { encodePatronOAuthNonce } from "@/lib/patron-oauth-state";
import {
  RELAY_API_BASE,
  RELAY_CREATOR_ID_STORAGE_KEY,
  RELAY_PUBLIC_SLUG_STORAGE_KEY,
  buildPatreonCreatorAuthorizeUrl,
  fetchPatronSessionIfPresent,
  fetchRelayComposeTiers,
  getCreatorPatronTierSummary,
  getCreatorProfile,
  hasRelaySignedInCookie,
  patchCreatorProfile,
  patchCreatorPublicSlug,
  putRelayNativeUpload,
  postCreatorWorkspace,
  postPatreonCreatorPrepare,
  postPilotUxSimulatePatreonConnect,
  relayNativeUploadCommit,
  relayNativeUploadInit,
  RelayApiError,
  type CreatorProfileIdentity,
  type CreatorWorkspaceData,
  type RelayComposeTierRow,
} from "@/lib/relay-api";
import { getWebAppOrigin } from "@/lib/site-origin";
import {
  PILOT_UX_ONBOARDING_RELAY_CREATOR_ID,
  pilotUxDevLoginEnabled
} from "@/lib/pilot-ux-dev-accounts";
import RelayUnifiedLogoV0 from "@/app/components/relay-unified-logo-v0";

export type OnboardingPath = "creator" | "supporter";

/* ──────────────────────────────────────────────────────────────────────────────
 * Brand mark — matches the Relay logo: circular node-network icon + gold wordmark
 * ──────────────────────────────────────────────────────────────────────────── */

export function RelayWordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const iconSize = size === "sm" ? 20 : size === "lg" ? 32 : 26;
  const textClass =
    size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-xl";

  return (
    <div className="flex items-center gap-2.5">
      {/* Circular node-network icon matching the Relay logo reference */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden
        className="flex-shrink-0"
      >
        {/* Outer circle */}
        <circle
          cx="16"
          cy="16"
          r="14"
          stroke="var(--relay-gold-500)"
          strokeWidth="1.5"
          fill="none"
        />
        {/* Central node */}
        <circle cx="16" cy="16" r="2.5" fill="var(--relay-gold-500)" />
        {/* Top-left node */}
        <circle cx="8" cy="10" r="2" fill="var(--relay-gold-500)" />
        {/* Top-right node */}
        <circle cx="24" cy="10" r="2" fill="var(--relay-gold-500)" />
        {/* Bottom node */}
        <circle cx="16" cy="25" r="2" fill="var(--relay-gold-500)" />
        {/* Connector lines */}
        <line x1="16" y1="16" x2="8" y2="10" stroke="var(--relay-gold-500)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="16" y1="16" x2="24" y2="10" stroke="var(--relay-gold-500)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="16" y1="16" x2="16" y2="25" stroke="var(--relay-gold-500)" strokeWidth="1.5" strokeLinecap="round" />
        {/* ECG-style tick on the bottom line */}
        <polyline
          points="13,21 14.5,18 15.5,22 17,19 18,21"
          stroke="var(--relay-gold-500)"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      <span
        className={cn("font-bold tracking-tight leading-none", textClass)}
        style={{ color: "var(--relay-gold-500)" }}
      >
        Relay
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Step 0 — Path picker
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ARTSY-FINTECH PATH PICKER · v1                                          ║
 * ║  Added 2026-04-22.                                                       ║
 * ║  To use the older path picker, replace `ArtsyFintechPathPicker` with a   ║
 * ║  simpler two-card grid (see git history for `PathPicker` / v0).          ║
 * ║  Related globals.css block is wrapped in the same v1 markers.            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * ──────────────────────────────────────────────────────────────────────────── */

export function PathPicker({
  onChoose,
}: {
  onChoose: (path: OnboardingPath) => void;
}) {
  return <ArtsyFintechPathPicker onChoose={onChoose} />;
}

/* ── ARTSY FINTECH PATH PICKER (v1) ── START ─────────────────────────────── */

const creatorPathCardDescription = (
  <>
    <p className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-[var(--relay-electric)] sm:text-[1.05rem]">
      <span>Connect your Patreon</span>
      <ArrowRight
        className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1"
        strokeWidth={2}
        aria-hidden
      />
    </p>
    <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
      Your vertical feed becomes a gorgeous custom gallery. Fully searchable. Patron tiers maintained.
    </p>
    <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
      Your public content gets inserted into the feeds of likely subscribers.
    </p>
  </>
);

const patronPathCardDescription = (
  <>
    <p className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-[var(--relay-electric)] sm:text-[1.05rem]">
      <span>Free to use. Keep it forever.</span>
      <ArrowRight
        className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1"
        strokeWidth={2}
        aria-hidden
      />
    </p>
    <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
      All the artists you support in one clean feed.
    </p>
    <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
      Discover new content from artists looking to woo you with promotions and freebies.
    </p>
  </>
);

function ArtsyFintechPathPicker({
  onChoose,
}: {
  onChoose: (path: OnboardingPath) => void;
}) {
  return (
    <div className="relay-artsy-fintech relative flex flex-col items-center gap-8 text-center sm:gap-10">
      {/* Ambient hero glow (existing util) */}
      <div
        className="relay-hero-glow pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 -translate-y-1/4 rounded-full blur-3xl"
        aria-hidden
      />
      {/* Subtle brand wash (green, matches --relay-electric) */}
      <div
        className="relay-artsy-gold-wash pointer-events-none absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[140px]"
        aria-hidden
      />

      {/* Hero: v0 unified animated mark + wordmark (includes "Gallery" subline in SVG) */}
      <div className="relative flex w-full max-w-sm flex-col items-center text-center sm:max-w-md">
        <RelayUnifiedLogoV0 size={220} />
      </div>

      <p className="mt-2 max-w-md px-4 text-balance text-base font-semibold leading-relaxed tracking-tight text-[var(--relay-fg)] sm:mt-3 sm:text-lg">
        Feel seen. See everything.
      </p>

      {/* Path cards — 2 col; hero mark is above (no flanking center logo) */}
      <div className="w-full max-w-6xl space-y-4 pt-6 sm:pt-8">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--relay-fg-muted)]">
        Elevate Your Patreon.
        </p>
        <div
          className="grid w-full grid-cols-1 items-stretch gap-4 sm:grid-cols-2"
          aria-label="Choose creator or patron path"
        >
          <div className="h-full min-h-0 w-full min-w-0 self-stretch">
            <PathCard
              label="Creators"
              description={creatorPathCardDescription}
              icon={<Palette className="h-6 w-6" strokeWidth={1.5} />}
              onClick={() => onChoose("creator")}
              accent="green"
              className="h-full w-full"
              labelLayout="hero"
            />
          </div>
          <div className="h-full min-h-0 w-full min-w-0 self-stretch">
            <PathCard
              label="Patrons"
              description={patronPathCardDescription}
              icon={<Heart className="h-6 w-6" strokeWidth={1.5} />}
              onClick={() => onChoose("supporter")}
              accent="green"
              className="h-full w-full"
              labelLayout="hero"
            />
          </div>
        </div>
      </div>

      {/* Sub-CTA: tiny feature strip — what Relay does, at a glance */}
      <ul className="grid w-full max-w-xl grid-cols-3 gap-4 text-[11px] text-[var(--relay-fg-muted)] sm:gap-8 sm:text-xs">
        <FeatureBullet
          icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />}
          label="Beautified galleries"
        />
        <FeatureBullet
          icon={<Heart className="h-3.5 w-3.5" strokeWidth={1.75} />}
          label="Follow & collect"
        />
        <FeatureBullet
          icon={<Compass className="h-3.5 w-3.5" strokeWidth={1.75} />}
          label="Discover artists"
        />
      </ul>

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

function FeatureBullet({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <li className="flex items-center justify-center gap-1.5">
      <span className="text-[var(--relay-gold-400)]/75">{icon}</span>
      <span className="font-medium text-[var(--relay-fg)]/85">{label}</span>
    </li>
  );
}

/* ── ARTSY FINTECH PATH PICKER (v1) ── END ───────────────────────────────── */

function PathCard({
  label,
  description,
  icon,
  onClick,
  accent,
  className,
  labelLayout = "stack",
}: {
  label: string;
  description: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  accent: "gold" | "green";
  className?: string;
  /** `hero` — label beside icon, larger type (path picker creator card) */
  labelLayout?: "stack" | "hero";
}) {
  const isGold = accent === "gold";
  const isHero = labelLayout === "hero";

  const iconBoxClass = cn(
    "relative flex shrink-0 items-center justify-center rounded-xl border transition-all duration-200",
    isHero
      ? "h-10 w-10 [&_svg]:!h-[1.125rem] [&_svg]:!w-[1.125rem]"
      : "h-12 w-12",
    isGold
      ? "border-[var(--relay-gold-500)]/40 bg-[var(--relay-gold-500)]/10 text-[var(--relay-gold-400)] group-hover:border-[var(--relay-gold-400)]/60 group-hover:shadow-[0_0_16px_0_rgba(197,179,88,0.3)]"
      : "border-[var(--relay-green-800)] bg-[var(--relay-green-950)] text-[var(--relay-green-400)] group-hover:border-[var(--relay-electric)]/60 group-hover:shadow-[0_0_16px_0_var(--relay-glow-strong)]"
  );

  const titleClass = isHero
    ? "min-w-0 flex-1 text-balance text-2xl font-bold leading-[1.1] tracking-tight text-[var(--relay-fg)] sm:text-3xl"
    : "text-lg font-bold tracking-tight text-[var(--relay-fg)]";

  const descriptionBlock =
    typeof description === "string" ? (
      <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
        {description}
      </p>
    ) : (
      <div className="space-y-2.5">{description}</div>
    );

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-start overflow-hidden rounded-2xl border p-7 text-left transition-all duration-250",
        isHero ? "gap-4" : "gap-5",
        isGold
          ? "border-[var(--relay-gold-500)]/30 bg-[var(--relay-surface-1)] hover:border-[var(--relay-gold-400)]/70 hover:-translate-y-1 hover:shadow-[0_12px_40px_-8px_rgba(197,179,88,0.25)]"
          : "border-[var(--relay-border)] bg-[var(--relay-surface-1)] hover:border-[var(--relay-electric)]/60 hover:-translate-y-1 hover:shadow-[0_12px_40px_-8px_var(--relay-glow-strong)]",
        className
      )}
    >
      {/* Corner glow — always slightly visible, brightens on hover */}
      <div
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl transition-opacity duration-400",
          isGold
            ? "bg-[var(--relay-gold-500)]/8 opacity-60 group-hover:opacity-100"
            : "bg-[var(--relay-electric)]/10 opacity-40 group-hover:opacity-100"
        )}
        aria-hidden
      />

      {isHero ? (
        <>
          <div className="flex w-full min-w-0 items-center gap-3 sm:gap-4">
            <div className={iconBoxClass}>{icon}</div>
            <h3 className={titleClass}>{label}</h3>
          </div>
          <div className="w-full">{descriptionBlock}</div>
        </>
      ) : (
        <>
          <div className={iconBoxClass}>{icon}</div>
          <div className="space-y-2">
            <h3 className={titleClass}>{label}</h3>
            {descriptionBlock}
          </div>
        </>
      )}
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Roadmap preview — shows all 3 steps with current/past/future states
 * ──────────────────────────────────────────────────────────────────────────── */

export function RoadmapPreview({
  path,
  currentStep,
}: {
  path: OnboardingPath;
  currentStep: number;
}) {
  const step2ConnectLabel = "Connect Patreon";
  const items =
    path === "creator"
      ? [
          { n: 1, label: "Create your account" },
          { n: 2, label: step2ConnectLabel },
          { n: 3, label: "Profile + URL" },
          { n: 4, label: "Import your art" },
        ]
      : [
          { n: 1, label: "Create your account" },
          { n: 2, label: "Connect Patreon" },
          { n: 3, label: "Open your feed" },
        ];

  return (
    <ol className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-[var(--relay-fg-muted)]">
      {items.map((it, idx) => {
        const active = it.n === currentStep;
        const done = it.n < currentStep;
        return (
          <li key={it.n} className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 transition-colors duration-200",
                active && "text-[var(--relay-fg)]",
                done && "text-[var(--relay-electric)]"
              )}
            >
              <span
                className={cn(
                  "inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-semibold leading-none",
                  active
                    ? "border-[var(--relay-electric)] bg-[var(--relay-electric)] text-[var(--relay-bg)]"
                    : done
                      ? "border-[var(--relay-electric)] bg-[var(--relay-electric)]/20 text-[var(--relay-electric)]"
                      : "border-[var(--relay-border)] text-[var(--relay-fg-muted)]"
                )}
              >
                {it.n}
              </span>
              {it.label}
            </span>
            {idx < items.length - 1 && (
              <span
                className={cn(
                  "transition-colors duration-200",
                  done ? "text-[var(--relay-electric)]/60" : "text-[var(--relay-border)]"
                )}
              >
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Reusable step header badge
 * ──────────────────────────────────────────────────────────────────────────── */

function StepBadge({
  step,
  of = 3,
  icon,
  extra,
}: {
  step: number;
  of?: number;
  icon?: React.ReactNode;
  extra?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--relay-electric)]/25 bg-[var(--relay-electric)]/8 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--relay-electric)]">
      {icon ?? <Zap className="h-2.5 w-2.5 fill-current" strokeWidth={0} />}
      {extra ? `Step ${step} of ${of} · ${extra}` : `Step ${step} of ${of}`}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Step 1 — Sign up
 * ──────────────────────────────────────────────────────────────────────────── */

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

  const totalSteps = path === "creator" ? 4 : 3;

  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <StepBadge
          step={1}
          of={totalSteps}
          icon={<Sparkles className="h-3 w-3" strokeWidth={2} />}
        />
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
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-[var(--relay-fg-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading sign-in form…
          </div>
        }
      >
        {path === "creator" ? (
          <StudioSupabaseSignInPanel variant="onboarding" onSuccess={onSignedIn} />
        ) : (
          <SupporterSignInPanel />
        )}
      </Suspense>

      <p className="text-center text-xs text-[var(--relay-fg-muted)]">
        We&apos;ll email you a magic link to verify the account — check your inbox right after submitting.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Step 2 — Connect Patreon (creator)
 * ──────────────────────────────────────────────────────────────────────────── */

const PatreonLogoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="14.5" cy="9.5" r="6.5" />
    <rect x="3" y="3" width="3.5" height="18" rx="1" />
  </svg>
);

export function StepConnectPatreonCreator({
  onConnected
}: {
  onConnected?: () => void;
}) {
  const [origin, setOrigin] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(getWebAppOrigin());
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

  const applyWorkspace = useCallback((ws: CreatorWorkspaceData) => {
    window.localStorage.setItem(RELAY_CREATOR_ID_STORAGE_KEY, ws.relay_creator_id);
    const slug = ws.public_slug?.trim();
    if (slug) {
      window.localStorage.setItem(RELAY_PUBLIC_SLUG_STORAGE_KEY, slug);
    }
    setCreatorId(ws.relay_creator_id);
    setHasSession(true);
  }, []);

  const ensureWorkspace = useCallback(async (): Promise<string | null> => {
    let cid = creatorId;
    if (!cid || !hasSession) {
      try {
        const ws = await postCreatorWorkspace();
        applyWorkspace(ws);
        cid = ws.relay_creator_id;
      } catch (e) {
        const msg =
          e instanceof RelayApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e);
        setError(`Could not create workspace: ${msg}`);
        return null;
      }
    }
    return cid;
  }, [applyWorkspace, creatorId, hasSession]);

  const handleConnectPatreon = useCallback(async () => {
    if (!clientId || !redirectUri) {
      setError("Patreon Client ID or redirect URI is missing — check env config.");
      return;
    }
    setError(null);
    setBusy(true);

    const cid = await ensureWorkspace();
    if (!cid) {
      setBusy(false);
      return;
    }

    try {
      const prep = await postPatreonCreatorPrepare(cid);
      setPendingOAuthCallbackTarget("patreon-creator");
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
  }, [clientId, redirectUri, ensureWorkspace]);

  const walkthroughDev =
    pilotUxDevLoginEnabled() && creatorId === PILOT_UX_ONBOARDING_RELAY_CREATOR_ID;

  const handleSimulatePatreon = useCallback(async () => {
    setError(null);
    setBusy(true);
    const cid = await ensureWorkspace();
    if (!cid) {
      setBusy(false);
      return;
    }
    try {
      await postPilotUxSimulatePatreonConnect();
      onConnected?.();
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
  }, [ensureWorkspace, onConnected]);

  const missingClientId = !clientId;
  const blocked = busy || !origin;

  return (
    <PatreonStepShell
      step={2}
      of={4}
      title="Connect your Patreon"
      subhead="Authorize Relay to import your posts so we can stream your art straight into your gallery."
    >
      <div className="flex flex-col gap-3">
        {missingClientId ? (
          <div className="rounded-xl border border-amber-900/40 bg-amber-950/30 px-4 py-3 text-xs text-amber-200/90">
            Set{" "}
            <code className="rounded bg-black/30 px-1">
              NEXT_PUBLIC_PATREON_CLIENT_ID
            </code>{" "}
            in{" "}
            <code className="rounded bg-black/30 px-1">web/.env.local</code> to
            enable Patreon OAuth.
          </div>
        ) : (
          <button
            type="button"
            disabled={blocked}
            onClick={() => void handleConnectPatreon()}
            className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl border border-[var(--relay-electric)]/30 bg-[var(--relay-electric)]/8 px-4 py-4 text-sm font-semibold text-[var(--relay-fg)] transition-all duration-200 hover:border-[var(--relay-electric)]/60 hover:bg-[var(--relay-electric)]/15 hover:shadow-[0_0_24px_0_var(--relay-glow)] disabled:opacity-50"
          >
            <span
              className="relay-shimmer relay-btn-shimmer-layer pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              aria-hidden
            />
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

        {walkthroughDev ? (
          <button
            type="button"
            disabled={blocked}
            onClick={() => void handleSimulatePatreon()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#52B788]/40 bg-[#52B788]/10 px-4 py-3 text-sm font-medium text-[#D1FAE5] transition-colors hover:border-[#52B788]/60 hover:bg-[#52B788]/15 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Simulating Patreon connect…
              </>
            ) : (
              <>Simulate Patreon connect (dev)</>
            )}
          </button>
        ) : null}
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-xs text-red-200/90">
          {error}
        </div>
      )}

      <p className="text-xs leading-relaxed text-[var(--relay-fg-muted)]">
        We&apos;ll bounce you to Patreon to authorize, then bring you right back to finish setting up.
      </p>

    </PatreonStepShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Step 2 — Connect Patreon (supporter)
 * ──────────────────────────────────────────────────────────────────────────── */

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
    void (async () => {
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
      of={3}
      title="Connect your Patreon"
      subhead="Sign in with Patreon so we can show you the creators and tiers you support. You need a verified email before this step (see step 1)."
    >
      {sessionGate === "loading" ? (
        <p className="text-center text-xs text-[var(--relay-fg-muted)]">
          Checking your Relay session…
        </p>
      ) : sessionGate === "needs_signin" ? (
        <p className="rounded-xl border border-amber-900/40 bg-amber-950/30 px-4 py-3 text-xs text-amber-100">
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
          className="space-y-2 rounded-xl border border-amber-800/50 bg-amber-950/35 px-3 py-3 text-xs text-amber-100"
          role="status"
        >
          <p>
            <span className="font-semibold text-amber-50">Confirm your email first.</span> We
            keep Patreon connect off until your inbox is verified — go back to step 1 or check
            your email for the confirmation link, then refresh this page.
          </p>
        </div>
      ) : !clientId.trim() ? (
        <p className="rounded-xl border border-amber-900/40 bg-amber-950/30 px-4 py-3 text-xs text-amber-100">
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
          className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl border border-[var(--relay-electric)]/30 bg-[var(--relay-electric)]/8 px-4 py-4 text-sm font-semibold text-[var(--relay-fg)] transition-all duration-200 hover:border-[var(--relay-electric)]/60 hover:bg-[var(--relay-electric)]/15 hover:shadow-[0_0_24px_0_var(--relay-glow)]"
        >
          <span
            className="relay-shimmer relay-btn-shimmer-layer pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            aria-hidden
          />
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

/* ──────────────────────────────────────────────────────────────────────────────
 * Shared Patreon step shell
 * ────────────────────────────────────────────────────────────────────────────── */

function PatreonStepShell({
  step,
  of = 3,
  title,
  subhead,
  children,
}: {
  step: number;
  of?: number;
  title: string;
  subhead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <StepBadge step={step} of={of} />
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

const PROFILE_BIO_LIMIT = 280;

export function StepCreatorProfileBasics({
  onAdvance,
}: {
  onAdvance?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<CreatorProfileIdentity | null>(null);
  const [creatorName, setCreatorName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const prof = await getCreatorProfile();
        if (cancelled) return;
        setIdentity(prof);
        setCreatorName(prof.display_name?.trim() || prof.username?.trim() || "");
        setAvatarUrl(prof.avatar_url ?? "");
        setBio(prof.bio ?? "");
      } catch (e) {
        if (cancelled) return;
        // 401/404 are fine — user may not have a creator workspace yet.
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

  const trimmedCreatorName = creatorName.trim();
  const derivedUsername = normalizeOnboardingUsername(trimmedCreatorName);
  const publicSlugDraft = sanitizePublicSlugDraft(derivedUsername);
  const creatorNameOk = trimmedCreatorName.length > 0;
  const derivedUsernameOk = /^[a-z0-9_]{3,32}$/.test(derivedUsername);
  const bioCount = bio.length;
  const bioOver = bioCount > PROFILE_BIO_LIMIT;
  const canSave = creatorNameOk && derivedUsernameOk && !bioOver && !avatarUploading;

  const isDirty = (field: keyof CreatorProfileIdentity, current: string): boolean => {
    const original = (identity?.[field] as string | null) ?? "";
    return current.trim() !== original.trim();
  };

  const buildPatch = () => {
    const patch: Record<string, string | null> = {};
    const currentUsername =
      identity?.username_norm?.trim() || identity?.username?.trim().toLowerCase() || "";
    if (trimmedCreatorName !== (identity?.display_name ?? "").trim()) {
      patch.display_name = trimmedCreatorName || null;
    }
    if (derivedUsername && derivedUsername !== currentUsername) {
      patch.username = derivedUsername;
    }
    if (isDirty("avatar_url", avatarUrl)) {
      patch.avatar_url = avatarUrl.trim() || null;
    }
    if (isDirty("bio", bio)) {
      patch.bio = bio.trim() || null;
    }
    return patch;
  };

  const handleAvatarUpload = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file for your avatar.");
      return;
    }
    const creatorId =
      typeof window !== "undefined"
        ? window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() ?? ""
        : "";
    if (!creatorId) {
      setError("Create your studio workspace before uploading an avatar.");
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setAvatarPreviewUrl(localPreview);
    setAvatarUploading(true);
    setError(null);
    try {
      const contentType = file.type || "image/png";
      const init = await relayNativeUploadInit({
        creator_id: creatorId,
        content_type: contentType,
        byte_size: file.size
      });
      await putRelayNativeUpload(init.upload.url, file, contentType);
      await relayNativeUploadCommit({
        creator_id: creatorId,
        media_id: init.media_id,
        content_type: contentType,
        byte_size: file.size
      });
      const nextUrl = `${RELAY_API_BASE}/api/v1/export/media/${encodeURIComponent(
        creatorId
      )}/${encodeURIComponent(init.media_id)}/content`;
      setAvatarUrl(nextUrl);
      setAvatarPreviewUrl(nextUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload avatar.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    if (!creatorNameOk) {
      setError("Add your creator name to continue.");
      return;
    }
    if (!derivedUsernameOk) {
      setError(
        "Your name needs at least 3 letters or numbers so Relay can create your @handle and gallery URL."
      );
      return;
    }
    const patch = buildPatch();
    setSaving(true);
    setError(null);
    try {
      if (Object.keys(patch).length > 0) {
        await patchCreatorProfile(patch);
      }
      const r = await patchCreatorPublicSlug(publicSlugDraft);
      if (typeof window !== "undefined" && r.public_slug?.trim()) {
        window.localStorage.setItem(RELAY_PUBLIC_SLUG_STORAGE_KEY, r.public_slug.trim());
      }
      onAdvance?.();
    } catch (e) {
      const msg =
        e instanceof RelayApiError
          ? e.status === 409
            ? "That handle is already taken. Try a different name."
            : e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg);
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <StepBadge
          step={3}
          of={4}
          extra="Artists"
          icon={<Palette className="h-3 w-3" strokeWidth={2} />}
        />
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Build your Relay identity
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          {identity
            ? "We pulled what we could from Patreon. Confirm your creator name and avatar."
            : "Add the name patrons will see. Relay creates your @handle and gallery URL from it."}
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
              htmlFor="onboarding-creator-name"
              className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]"
            >
              Creator name <span className="text-[var(--relay-green-400)]">*</span>
            </label>
            <input
              id="onboarding-creator-name"
              type="text"
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              placeholder="Your studio or artist name"
              className="w-full rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-3 text-sm text-[var(--relay-fg)] placeholder-[var(--relay-fg-muted)] outline-none ring-[var(--relay-green-600)]/30 focus:ring-2"
              maxLength={120}
            />
            {derivedUsernameOk ? (
              <p className="text-xs text-[var(--relay-fg-muted)]">
                Patrons will see{" "}
                <span className="font-medium text-[var(--relay-fg)]">{trimmedCreatorName}</span>
                {" · "}
                <span className="text-[var(--relay-green-400)]">@{derivedUsername}</span>
                {" · "}
                <span className="text-[var(--relay-green-400)]">/patron/c/{publicSlugDraft}</span>
              </p>
            ) : trimmedCreatorName ? (
              <p className="text-xs text-[var(--relay-fg-muted)]">
                Add at least 3 letters or numbers so Relay can create your @handle.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="onboarding-avatar"
              className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]"
            >
              Avatar image
            </label>
            <div className="flex items-center gap-3">
              {(avatarPreviewUrl || avatarUrl).trim() ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={(avatarPreviewUrl || avatarUrl).trim()}
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
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <label
                  htmlFor="onboarding-avatar-file"
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-3 text-sm font-medium text-[var(--relay-fg)] transition-colors hover:border-[var(--relay-electric)]/40"
                >
                  {avatarUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Camera className="h-4 w-4" strokeWidth={1.8} aria-hidden />
                  )}
                  {avatarUploading ? "Uploading avatar…" : "Upload avatar"}
                </label>
                <input
                  id="onboarding-avatar-file"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void handleAvatarUpload(e.target.files?.[0])}
                />
                <input
                  id="onboarding-avatar"
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="Or paste an image URL"
                  className="min-w-0 rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-2.5 text-xs text-[var(--relay-fg)] placeholder-[var(--relay-fg-muted)] outline-none ring-[var(--relay-green-600)]/30 focus:ring-2"
                  spellCheck={false}
                />
              </div>
            </div>
            <p className="text-xs text-[var(--relay-fg-muted)]">
              If Patreon provides an avatar, Relay uses it automatically. You can replace it here.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="onboarding-bio"
              className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]"
            >
              Short bio
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

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={loading || saving || !canSave}
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
        <p className="text-center text-[11px] text-[var(--relay-fg-muted)]">
          Your @handle and gallery URL come from this name. Personalize your username later in profile
          settings.
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Step 4 — Creator import handoff (detected platform signals + import choices).
 * Step 3 derives the public URL from the creator name.
 * ─────────────────────────────────────────────────────────────────────────── */

function formatOnboardingTierDetail(tiers: RelayComposeTierRow[]): string {
  if (tiers.length === 0) {
    return "Tier bins are waiting for import. Relay will use them to organize your media.";
  }
  const parts = tiers.map((tier) => {
    const title = tier.title.trim() || "Tier";
    const dollars = (tier.amount_cents ?? 0) / 100;
    const price =
      Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
    return `${title} (${price})`;
  });
  return `Tiers Detected: ${parts.join(", ")}`;
}

function normalizeOnboardingUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function sanitizePublicSlugDraft(raw: string): string {
  let s = raw.toLowerCase().replace(/_/g, "-").replace(/[^a-z0-9-]+/g, "-");
  s = s.replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (s.length > 32) {
    s = s.slice(0, 32).replace(/-+$/g, "");
  }
  return s;
}

/** When true, creator onboarding step 4 shows `InstallExtensionPrompt`. Default off pre–store launch. */
function isRelayExtensionOnboardingPromptEnabled(): boolean {
  const v =
    typeof process.env.NEXT_PUBLIC_RELAY_EXTENSION_ONBOARDING_PROMPT === "string"
      ? process.env.NEXT_PUBLIC_RELAY_EXTENSION_ONBOARDING_PROMPT.trim().toLowerCase()
      : "";
  return v === "1" || v === "true" || v === "yes";
}

export function StepClaimHandleAndGo() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<
    "loading" | "profile_error" | "ready"
  >("loading");
  const [studioIdInBrowser, setStudioIdInBrowser] = useState("");
  const [snapPatreon, setSnapPatreon] = useState(false);
  const [snapSubstar, setSnapSubstar] = useState(false);
  const [snapTierCount, setSnapTierCount] = useState<number | null>(null);
  const [snapTierDetail, setSnapTierDetail] = useState<string>(
    "Tier bins are waiting for import. Relay will use them to organize your media."
  );
  const [snapPatronLine, setSnapPatronLine] = useState<string | null>(null);
  const [snapRevenueLine, setSnapRevenueLine] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      setLoading(true);
      setSnapshotStatus("loading");
      const creatorIdLs =
        typeof window !== "undefined"
          ? window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() ?? ""
          : "";
      try {
        setStudioIdInBrowser(creatorIdLs);
        let profile: CreatorProfileIdentity | null = null;
        let profileFetchError = false;
        try {
          profile = await getCreatorProfile();
        } catch {
          profileFetchError = true;
          profile = null;
        }
        if (cancelled) return;

        const hasPa = Boolean(profile?.patreon_campaign_id?.trim());
        const hasSs = Boolean(profile?.subscribestar_profile_id?.trim());
        setSnapPatreon(hasPa);
        setSnapSubstar(hasSs);

        let tiersN: number | null = null;
        let tierDetail =
          "Tier bins are waiting for import. Relay will use them to organize your media.";
        if (creatorIdLs) {
          try {
            const { tiers } = await fetchRelayComposeTiers(creatorIdLs);
            tiersN = tiers.length;
            tierDetail = formatOnboardingTierDetail(tiers);
          } catch {
            tiersN = null;
          }
        }
        setSnapTierCount(tiersN);
        setSnapTierDetail(tierDetail);

        let patronLine: string | null = null;
        if (hasPa) {
          try {
            const s = await getCreatorPatronTierSummary();
            patronLine = `${s.total_patrons} patron${s.total_patrons === 1 ? "" : "s"} in your synced membership snapshot`;
          } catch {
            patronLine = null;
          }
        }
        let revenueLine: string | null = null;
        if (hasPa) {
          try {
            const s = await getCreatorPatronTierSummary();
            const monthlyCents = s.tiers.reduce(
              (sum, tier) => sum + (tier.amount_cents ?? 0) * tier.patron_count,
              0
            );
            revenueLine =
              monthlyCents > 0
                ? `$${(monthlyCents / 100).toLocaleString(undefined, {
                    maximumFractionDigits: 0
                  })}/mo detected`
                : "No active paid revenue detected yet";
          } catch {
            revenueLine = null;
          }
        }
        setSnapPatronLine(patronLine);
        setSnapRevenueLine(revenueLine);

        setSnapshotStatus(profileFetchError ? "profile_error" : "ready");
      } catch {
        if (!cancelled) {
          setSnapshotStatus("profile_error");
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

  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <StepBadge
          step={4}
          of={4}
          extra="Artists"
          icon={<Zap className="h-3 w-3" strokeWidth={2} />}
        />
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          What Relay sees
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          Your profile is live. Here is the signal Relay can act on before you import your media.
        </p>
      </div>

      <div className="space-y-2">
        <div
          className={cn(
            "rounded-2xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] p-3",
            snapshotStatus === "loading" && "opacity-70"
          )}
          aria-busy={snapshotStatus === "loading"}
        >
          {snapshotStatus === "loading" ? (
            <p className="flex items-center gap-2 text-sm text-[var(--relay-fg-muted)]">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
              Checking your connected platforms and tiers…
            </p>
          ) : (
            <div className="space-y-2">
              {snapshotStatus === "profile_error" ? (
                <p className="rounded-xl border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm leading-relaxed text-red-100">
                  Your session may have expired, or the Relay API may be unreachable from this page.
                  Refresh, sign in again, then revisit step 4.
                </p>
              ) : null}
              <RelaySignalDot
                label="Tiers"
                status={snapTierCount !== null && snapTierCount > 0 ? "ready" : "pending"}
                detail={snapTierDetail}
              />
              <RelaySignalDot
                label="Patrons"
                status={snapPatronLine ? "ready" : snapPatreon || snapSubstar ? "pending" : "missing"}
                detail={
                  snapPatronLine ??
                  (snapPatreon || snapSubstar
                    ? "Membership platform connected; patron snapshot has not synced yet."
                    : `No membership platform linked to this studio yet${studioIdInBrowser ? "." : "."}`)
                }
              />
              <RelaySignalDot
                label="Revenue"
                status={snapRevenueLine?.startsWith("$") ? "ready" : "pending"}
                detail={snapRevenueLine ?? "Revenue appears after tier and patron snapshots sync."}
              />
              <RelaySignalDot
                label="Media"
                status="pending"
                detail="Not connected yet. Import your media next so Relay can match art to tier access."
              />
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setImportModalOpen(true)}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--relay-green-600)] px-5 py-3 text-sm font-semibold text-[var(--relay-fg)] transition-colors hover:bg-[var(--relay-green-400)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        Import your Media
        <ArrowRight className="h-4 w-4" strokeWidth={2} />
      </button>

      {isRelayExtensionOnboardingPromptEnabled() ? (
        <InstallExtensionPrompt variant="relay" title="Relay browser extension" />
      ) : null}

      {error ? (
        <p className="text-xs font-medium text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {importModalOpen ? (
        <ImportMediaChoiceModal
          onClose={() => setImportModalOpen(false)}
        />
      ) : null}
    </div>
  );
}

function RelaySignalDot({
  label,
  status,
  detail
}: {
  label: string;
  status: "ready" | "pending" | "missing";
  detail: string;
}) {
  const dotClass =
    status === "ready"
      ? "border-[var(--relay-green-400)] bg-[var(--relay-green-400)]"
      : status === "pending"
        ? "border-amber-300 bg-amber-400/30"
        : "border-[var(--relay-border)] bg-[var(--relay-surface-2)]";
  return (
    <details className="group rounded-xl border border-[var(--relay-border)] bg-[var(--relay-bg)]/45 px-3 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <span
            className={cn("h-2.5 w-2.5 rounded-full border", dotClass)}
            aria-hidden
          />
          <span className="text-sm font-semibold text-[var(--relay-fg)]">{label}</span>
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--relay-fg-muted)]">
          {status === "ready" ? "Detected" : status === "pending" ? "Next" : "Open"}
        </span>
      </summary>
      <p className="mt-2 pl-5 text-xs leading-relaxed text-[var(--relay-fg-muted)]">
        {detail}
      </p>
    </details>
  );
}

function ImportMediaChoiceModal({
  onClose
}: {
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-media-title"
    >
      <div className="w-full max-w-lg rounded-3xl border border-[var(--relay-electric)]/20 bg-[var(--relay-surface-2)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--relay-green-400)]">
              Import your art
            </p>
            <h3
              id="import-media-title"
              className="text-xl font-semibold tracking-tight text-[var(--relay-fg)]"
            >
              Choose how Relay pulls your media
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--relay-border)] p-2 text-[var(--relay-fg-muted)] transition-colors hover:text-[var(--relay-fg)]"
            aria-label="Close import options"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="mt-6 grid gap-3">
          <Link
            href="/patreon/cookie"
            className="group rounded-2xl border border-[var(--relay-green-500)]/40 bg-[var(--relay-green-600)]/15 p-4 transition-colors hover:border-[var(--relay-green-400)] hover:bg-[var(--relay-green-600)]/25"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold text-[var(--relay-fg)]">
                Media Sync
              </span>
              <span className="rounded-full bg-[var(--relay-green-600)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--relay-fg)]">
                Recommended
              </span>
            </span>
            <span className="mt-2 block text-sm leading-relaxed text-[var(--relay-fg-muted)]">
              Pull your media automatically from Patreon. (Requires login cookie)
            </span>
          </Link>

          <Link
            href="/manual-import"
            className="rounded-2xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] p-4 transition-colors hover:border-[var(--relay-electric)]/40"
          >
            <span className="text-base font-semibold text-[var(--relay-fg)]">
              Manual Import
            </span>
            <span className="mt-2 block text-sm leading-relaxed text-[var(--relay-fg-muted)]">
              More privacy. Upload art directly into your tiers manually.
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function StepSupporterReady() {
  return (
    <div className="flex flex-col items-center gap-7 py-2 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--relay-green-800)] bg-[var(--relay-green-950)]">
        <Heart
          className="h-7 w-7 text-[var(--relay-green-400)]"
          strokeWidth={1.5}
        />
        <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-[var(--relay-green-400)]" />
      </div>
      <div className="max-w-sm space-y-2.5">
        <StepBadge step={3} of={3} extra="You're in" />
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
        className="group inline-flex items-center gap-2 rounded-xl bg-[var(--relay-electric)] px-7 py-3.5 text-sm font-bold text-white transition-colors duration-200 hover:bg-[var(--relay-green-600)]"
      >
        Open my feed
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" strokeWidth={2.5} />
      </Link>
    </div>
  );
}
