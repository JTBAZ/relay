"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
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
import { patronPatronOAuthRedirectUri } from "@/lib/patron-patron-redirect-uri";
import { encodePatronOAuthState } from "@/lib/patron-oauth-state";
import {
  RELAY_CREATOR_ID_STORAGE_KEY,
  RELAY_PUBLIC_SLUG_STORAGE_KEY,
  buildPatreonCreatorAuthorizeUrl,
  hasRelaySignedInCookie,
  postCreatorWorkspace,
  postPatreonCreatorPrepare,
  RelayApiError,
} from "@/lib/relay-api";
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
 * ║  To REVERT: change the body of `PathPicker` (below) so it returns        ║
 * ║  <LegacyPathPicker onChoose={onChoose} /> instead of                     ║
 * ║  <ArtsyFintechPathPicker onChoose={onChoose} />. The legacy component    ║
 * ║  is kept intact at the bottom of this section.                           ║
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

/* ── LEGACY PATH PICKER (pre-v1) — kept verbatim for easy revert ─────────── */

function LegacyPathPicker({
  onChoose,
}: {
  onChoose: (path: OnboardingPath) => void;
}) {
  return (
    <div className="relative flex flex-col items-center gap-14 text-center">
      {/* Ambient glow behind hero */}
      <div
        className="relay-hero-glow pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/4 rounded-full blur-3xl"
        aria-hidden
      />

      {/* Logo hero (v0 unified mark) + welcome copy */}
      <div className="flex flex-col items-center gap-5">
        <div
          className="flex max-w-[200px] shrink-0 items-center justify-center"
          aria-hidden
        >
          <RelayUnifiedLogoV0 size={160} />
        </div>
        <div className="space-y-3">
          <h1 className="text-balance text-3xl font-bold tracking-tight text-[var(--relay-fg)] sm:text-4xl">
            Welcome
          </h1>
          <p className="max-w-sm text-base leading-relaxed text-[var(--relay-fg-muted)]">
            Are you here to share your work, or to support the artists you love?
          </p>
        </div>
      </div>

      {/* Choice cards */}
      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <PathCard
          label="I'm a Creator"
          description={creatorPathCardDescription}
          icon={<Palette className="h-6 w-6" strokeWidth={1.5} />}
          onClick={() => onChoose("creator")}
          accent="gold"
        />
        <PathCard
          label="Patrons"
          description={patronPathCardDescription}
          icon={<Heart className="h-6 w-6" strokeWidth={1.5} />}
          onClick={() => onChoose("supporter")}
          accent="green"
          labelLayout="hero"
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
  const items =
    path === "creator"
      ? [
          { n: 1, label: "Create your account" },
          { n: 2, label: "Connect Patreon" },
          { n: 3, label: "Claim your gallery URL" },
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
  icon,
  extra,
}: {
  step: number;
  icon?: React.ReactNode;
  extra?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--relay-electric)]/25 bg-[var(--relay-electric)]/8 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--relay-electric)]">
      {icon ?? <Zap className="h-2.5 w-2.5 fill-current" strokeWidth={0} />}
      {extra ? `Step ${step} of 3 · ${extra}` : `Step ${step} of 3`}
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

  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <StepBadge step={1} icon={<Sparkles className="h-3 w-3" strokeWidth={2} />} />
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          {headline}
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          {subhead}
        </p>
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
          <SupporterSignInPanel onSuccess={onSignedIn} />
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
          disabled={busy || !origin}
          onClick={() => void handleConnect()}
          className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl border border-[var(--relay-electric)]/30 bg-[var(--relay-electric)]/8 px-4 py-4 text-sm font-semibold text-[var(--relay-fg)] transition-all duration-200 hover:border-[var(--relay-electric)]/60 hover:bg-[var(--relay-electric)]/15 hover:shadow-[0_0_24px_0_var(--relay-glow)] disabled:opacity-50"
        >
          {/* shimmer layer */}
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

      {error && (
        <div className="rounded-xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-xs text-red-200/90">
          {error}
        </div>
      )}

      <p className="text-xs leading-relaxed text-[var(--relay-fg-muted)]">
        We&apos;ll bounce you to Patreon to authorize, then bring you right back to finish setting up.
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

/* ──────────────────────────────────────────────────────────────────────────────
 * Step 2 — Connect Patreon (supporter)
 * ──────────────────────────────────────────────────────────────────────────── */

export function StepConnectPatreonSupporter({
  initialClientId,
}: {
  initialClientId: string;
}) {
  const searchParams = useSearchParams();
  const [creatorId] = useState(
    () => process.env.NEXT_PUBLIC_RELAY_CREATOR_ID?.trim() || "dev_creator"
  );
  const [campaignNumericId, setCampaignNumericId] = useState(() => {
    const fromEnv =
      process.env.NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID?.trim() ?? "";
    return fromEnv.replace(/\D/g, "");
  });

  useEffect(() => {
    const q = searchParams.get("campaign")?.replace(/\D/g, "") ?? "";
    if (q) setCampaignNumericId(q);
  }, [searchParams]);

  const redirectUri = patronPatronOAuthRedirectUri();
  const clientId = initialClientId;

  const authorizeUrl = useMemo(() => {
    if (!clientId.trim() || !redirectUri || !campaignNumericId.trim()) return "";
    const u = new URL("https://www.patreon.com/oauth2/authorize");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", clientId.trim());
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("scope", PATREON_PATRON_OAUTH_SCOPES);
    u.searchParams.set(
      "state",
      encodePatronOAuthState({
        creator_id: creatorId.trim() || "dev_creator",
        patreon_campaign_numeric_id: campaignNumericId.trim(),
      })
    );
    return u.toString();
  }, [clientId, redirectUri, creatorId, campaignNumericId]);

  return (
    <PatreonStepShell
      step={2}
      title="Connect your Patreon"
      subhead="Sign in with Patreon so we can show you the creators and tiers you support."
    >
      {!clientId.trim() ? (
        <div className="rounded-xl border border-amber-900/40 bg-amber-950/30 px-4 py-3 text-xs text-amber-200/90">
          Set{" "}
          <code className="rounded bg-black/30 px-1">PATREON_CLIENT_ID</code> or{" "}
          <code className="rounded bg-black/30 px-1">
            NEXT_PUBLIC_PATREON_CLIENT_ID
          </code>{" "}
          in{" "}
          <code className="rounded bg-black/30 px-1">web/.env.local</code>.
        </div>
      ) : !campaignNumericId.trim() ? (
        <div className="rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-4 py-3 text-xs text-[var(--relay-fg-muted)]">
          Set{" "}
          <code className="rounded bg-[var(--relay-bg)] px-1">
            NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID
          </code>{" "}
          or open this page with{" "}
          <code className="rounded bg-[var(--relay-bg)] px-1">?campaign=…</code>.
        </div>
      ) : !redirectUri ? (
        <p className="flex items-center justify-center gap-2 py-2 text-xs text-[var(--relay-fg-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
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
 * ───────────────────────────────���───���──────────────────────────────────────── */

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
        <StepBadge step={step} />
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

/* ──────────────────────────────────────────────────────────────────────────────
 * Step 3 — Creator: Claim handle + extension
 * ──────────────────────────────────────────────────────────────────────────── */

export function StepClaimHandleAndGo({
  onFinish,
}: {
  onFinish?: () => void;
}) {
  const [recommended, setRecommended] = useState<string>("");
  const [handle, setHandle] = useState<string>("");
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    const slug =
      typeof window !== "undefined"
        ? window.localStorage.getItem(RELAY_PUBLIC_SLUG_STORAGE_KEY)?.trim() ?? ""
        : "";
    setRecommended(slug);
    if (slug && !edited) setHandle(slug);
  }, [edited]);

  const sanitized = handle.toLowerCase().replace(/[^a-z0-9_-]/g, "");

  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <StepBadge
          step={3}
          icon={<Zap className="h-3 w-3" strokeWidth={2} />}
          extra="Artists"
        />
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Claim your gallery URL
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          This is where patrons will discover your work.
          {recommended
            ? " We pulled a suggestion from your Patreon — feel free to edit."
            : ""}
        </p>
      </div>

      {/* Handle input */}
      <div className="space-y-2">
        <label
          htmlFor="onboarding-handle"
          className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]"
        >
          Your gallery URL
        </label>
        <div           className="flex items-stretch overflow-hidden rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] transition-all duration-200 focus-within:border-[var(--relay-electric)]/60 focus-within:ring-1 focus-within:ring-[var(--relay-electric)]/20 focus-within:shadow-[0_0_16px_0_var(--relay-glow)]">
          <span className="select-none border-r border-[var(--relay-border)] bg-[var(--relay-bg)] px-3.5 py-3 text-sm text-[var(--relay-fg-muted)]">
            relay.so/
          </span>
          <input
            id="onboarding-handle"
            type="text"
            value={handle}
            onChange={(e) => {
              setEdited(true);
              setHandle(e.target.value);
            }}
            placeholder="yourhandle"
            className="flex-1 bg-transparent px-3.5 py-3 text-sm text-[var(--relay-fg)] placeholder-[var(--relay-fg-muted)] focus:outline-none"
          />
        </div>
        {sanitized && (
          <p className="text-xs text-[var(--relay-fg-muted)]">
            Preview:{" "}
            <span className="font-medium text-[var(--relay-electric)]">
              relay.so/{sanitized}
            </span>
          </p>
        )}
      </div>

      {/* Extension prompt */}
      <div className="space-y-2.5">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]">
          Pull in your gallery (optional)
        </p>
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

      {/* Primary CTA */}
      <button
        type="button"
        onClick={onFinish}
        className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--relay-electric)] px-5 py-3.5 text-sm font-bold text-white transition-colors duration-200 hover:bg-[var(--relay-green-600)]"
      >
        Take me to my gallery
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" strokeWidth={2.5} />
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Step 3 — Supporter: Feed ready
 * ──────────────────────────────────────────────────────────────────────────── */

export function StepSupporterReady({ onFinish }: { onFinish?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-8 py-2 text-center">
      {/* Icon */}
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--relay-green-800)] bg-[var(--relay-green-950)]">
        <Heart
          className="h-7 w-7 text-[var(--relay-green-400)]"
          strokeWidth={1.5}
        />
        <span
          className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-[var(--relay-green-400)]"
          aria-hidden
        />
      </div>

      <div className="max-w-sm space-y-2.5">
        <StepBadge step={3} extra="You're in" />
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Your feed is ready
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          Everything you support — in one beautiful, scrollable gallery. Open it
          up and start exploring.
        </p>
      </div>

      <button
        type="button"
        onClick={onFinish}
        className="group inline-flex items-center gap-2 rounded-xl bg-[var(--relay-electric)] px-7 py-3.5 text-sm font-bold text-white transition-colors duration-200 hover:bg-[var(--relay-green-600)]"
      >
        Open my feed
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" strokeWidth={2.5} />
      </button>
    </div>
  );
}
