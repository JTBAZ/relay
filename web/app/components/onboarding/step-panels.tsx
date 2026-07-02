"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Camera,
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
import { CreatorImportReadinessPanel } from "@/app/components/onboarding/CreatorImportReadinessPanel";
import { isReservedPathSegment } from "@/lib/reserved-paths";
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
  getCreatorProfile,
  hasRelaySignedInCookie,
  patchCreatorProfile,
  patchCreatorPublicSlug,
  patchRelayUsername,
  putRelayNativeUpload,
  postCreatorWorkspace,
  postPatreonCreatorPrepare,
  postPilotUxSimulatePatreonConnect,
  relayNativeUploadCommit,
  relayNativeUploadInit,
  RelayApiError,
  type CreatorProfileIdentity,
  type CreatorWorkspaceData,
} from "@/lib/relay-api";
import {
  fetchPatronProfileMe,
  patchPatronProfileMe,
  resolvedPatronDigestTimezone,
  PATRON_PROFILE_BIO_UI_LIMIT,
  PATRON_PROFILE_DISPLAY_NAME_LIMIT,
} from "@/lib/patron-profile-api";
import type {
  NotificationCadencePreferenceId,
  NotificationDigestSlotId,
} from "@/lib/notification-digest-preferences";
import {
  digestCadenceFromProfile,
  digestSlotFromProfile,
  NotificationDigestPreferencesForm,
} from "@/components/patron/NotificationDigestPreferencesForm";
import { getWebAppOrigin } from "@/lib/site-origin";
import {
  PILOT_UX_ONBOARDING_RELAY_CREATOR_ID,
  pilotUxDevLoginEnabled
} from "@/lib/pilot-ux-dev-accounts";
import RelayUnifiedLogoV0 from "@/app/components/relay-unified-logo-v0";

export type OnboardingPath = "creator" | "supporter";

const ONBOARDING_EASE = [0.22, 1, 0.36, 1] as const;

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

type PathCardBenefit = {
  label: string;
  detail: string;
};

const creatorBenefits: PathCardBenefit[] = [
  {
    label: "Enhanced UI",
    detail: "Your Patreon feed becomes a clean, searchable gallery.",
  },
  {
    label: "Improved Experience",
    detail: "Better browsing helps gain and retain subscribers.",
  },
  {
    label: "Protected archive",
    detail: "Back up posts while keeping paid tiers intact.",
  },
  {
    label: "Audience discovery",
    detail: "Give your work a better surface to find new fans.",
  },
];

const followerBenefits: PathCardBenefit[] = [
  {
    label: "One clean feed",
    detail: "All supported creators in one unified gallery.",
  },
  {
    label: "Search and save",
    detail:
      "Find old posts, collect favorites, revisit anytime. No more chronological scrolling.",
  },
  {
    label: "Creator discovery",
    detail: "Preview artists who match what you already love.",
  },
  {
    label: "Free to use",
    detail: "Only pay for perks that help you further support your Creators.",
  },
];

function PathCardBenefitList({
  items,
  delay = 0,
}: {
  items: PathCardBenefit[];
  delay?: number;
}) {
  return (
    <ul className="grid gap-2 text-left">
      {items.map((item, index) => (
        <motion.li
          key={item.label}
          initial={{ opacity: 0, x: -8 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{
            duration: 0.38,
            delay: delay + index * 0.06,
            ease: ONBOARDING_EASE,
          }}
          className="grid grid-cols-[0.375rem_1fr] gap-x-2 gap-y-0.5 text-sm leading-snug"
        >
          <span
            className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--relay-electric)]/80 shadow-[0_0_8px_var(--relay-glow)]"
            aria-hidden
          />
          <span className="font-medium text-[var(--relay-fg)]">{item.label}</span>
          <span className="col-start-2 text-xs leading-snug text-[var(--relay-fg-muted)]">
            {item.detail}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

function RelayUpgradeGraphic({ kind }: { kind: "creator" | "follower" }) {
  const sourceLabel = kind === "creator" ? "Patreon feed" : "Patreon tabs";
  const relayLabel = kind === "creator" ? "Relay gallery" : "Relay feed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.48, ease: ONBOARDING_EASE }}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-xl border border-[var(--relay-electric)]/10 bg-black/20 p-2.5"
      aria-hidden
    >
      <div className="min-w-0 space-y-1 rounded-lg border border-white/10 bg-black/30 p-2">
        <span className="block truncate text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-[var(--relay-fg-muted)]">
          {sourceLabel}
        </span>
          {[0, 1, 2].map((idx) => (
          <motion.span
            key={`source-row-${kind}-${idx}`}
            className="block h-1.5 rounded-full bg-white/15"
            initial={{ scaleX: 0, opacity: 0 }}
            whileInView={{ scaleX: 1, opacity: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.32, delay: idx * 0.05, ease: ONBOARDING_EASE }}
            style={{ width: `${84 - idx * 14}%`, transformOrigin: "left" }}
          />
        ))}
      </div>
      <ArrowRight className="h-4 w-4 text-[var(--relay-electric)]" strokeWidth={2} />
      <div className="min-w-0 space-y-1 rounded-lg border border-[var(--relay-electric)]/25 bg-[var(--relay-green-950)]/55 p-2">
        <span className="block truncate text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-[var(--relay-electric)]">
          {relayLabel}
        </span>
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2, 3, 4, 5].map((idx) => (
            <motion.span
              key={`relay-cell-${kind}-${idx}`}
              className="h-3 rounded-[0.2rem] bg-[var(--relay-electric)]/25"
              initial={{ opacity: 0, scale: 0.72 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.28, delay: 0.12 + idx * 0.035, ease: ONBOARDING_EASE }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

const creatorPathCardDescription = (
  <p className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-[var(--relay-electric)] sm:text-[1.05rem]">
    <span>Build my Relay gallery</span>
    <ArrowRight
      className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1"
      strokeWidth={2}
      aria-hidden
    />
  </p>
);

const patronPathCardDescription = (
  <p className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-[var(--relay-electric)] sm:text-[1.05rem]">
    <span>Upgrade my feed</span>
    <ArrowRight
      className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1"
      strokeWidth={2}
      aria-hidden
    />
  </p>
);

type CtaPersonIconProps = {
  active: "lead" | "follower";
};

function PersonGlyph({
  cx,
  cy,
  active,
  scale = 1,
}: {
  cx: number;
  cy: number;
  active: boolean;
  scale?: number;
}) {
  const stroke = active ? "var(--relay-electric)" : "rgba(156,163,175,0.68)";
  const glow = active ? "drop-shadow(0 0 5px rgba(0,170,111,0.5))" : undefined;

  return (
    <g
      transform={`translate(${cx} ${cy}) scale(${scale})`}
      style={glow ? { filter: glow } : undefined}
    >
      <circle
        cx="0"
        cy="-5.2"
        r="2.7"
        stroke={stroke}
        strokeWidth="1.25"
        fill="none"
      />
      <path
        d="M-5.6 4.6a5.6 5.6 0 0 1 11.2 0"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

function CtaPersonIcon({ active }: CtaPersonIconProps) {
  const isLead = active === "lead";

  return (
    <svg viewBox="0 0 36 34" fill="none" aria-hidden="true" className="overflow-visible">
      <PersonGlyph cx={18} cy={8.3} active={isLead} scale={isLead ? 1.08 : 0.98} />
      {[0, 1, 2].map((idx) => (
        <circle
          key={`relationship-dot-${idx}`}
          cx="18"
          cy={14 + idx * 1.95}
          r="0.4"
          fill="currentColor"
          opacity={0.14 + idx * 0.045}
        />
      ))}
      <PersonGlyph cx={5.3} cy={27.1} active={false} scale={0.72} />
      <PersonGlyph cx={18} cy={27.1} active={!isLead} scale={!isLead ? 0.84 : 0.72} />
      <PersonGlyph cx={30.7} cy={27.1} active={false} scale={0.72} />
    </svg>
  );
}

function RelayUpgradePanel() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: ONBOARDING_EASE }}
      className="w-full max-w-6xl rounded-2xl border border-[var(--relay-electric)]/10 bg-black/20 p-4 text-left shadow-[0_0_0_1px_rgba(34,197,94,0.03)] sm:p-5"
      aria-labelledby="relay-adds-heading"
    >
      <div className="mb-4 flex flex-col gap-1 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--relay-electric)]/80">
          What Relay adds
        </p>
        <h2
          id="relay-adds-heading"
          className="text-balance text-lg font-semibold tracking-tight text-[var(--relay-fg)]"
        >
          An enhancement layer for your Patreon
        </h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.08, ease: ONBOARDING_EASE }}
          className="space-y-3 rounded-xl border border-white/10 bg-[var(--relay-surface-1)]/70 p-4"
        >
          <RelayUpgradeGraphic kind="creator" />
          <div>
            <h3 className="mb-2 text-sm font-bold text-[var(--relay-electric)]">
              Creators
            </h3>
            <PathCardBenefitList items={creatorBenefits} delay={0.14} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, delay: 0.16, ease: ONBOARDING_EASE }}
          className="space-y-3 rounded-xl border border-white/10 bg-[var(--relay-surface-1)]/70 p-4"
        >
          <RelayUpgradeGraphic kind="follower" />
          <div>
            <h3 className="mb-2 text-sm font-bold text-[var(--relay-electric)]">
              Subscribers
            </h3>
            <PathCardBenefitList items={followerBenefits} delay={0.22} />
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}

function ArtsyFintechPathPicker({
  onChoose,
}: {
  onChoose: (path: OnboardingPath) => void;
}) {
  return (
    <div className="relay-artsy-fintech relative flex w-full min-w-0 flex-col items-center gap-8 overflow-x-hidden text-center sm:gap-10">
      {/* Ambient hero glow (existing util) */}
      <div
        className="relay-hero-glow pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 -translate-y-1/4 rounded-full blur-3xl"
        aria-hidden
      />
      {/* Subtle brand wash (green, matches --relay-electric) */}
      <div
        className="relay-artsy-gold-wash pointer-events-none absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[140px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[34rem] w-[34rem] max-w-full rounded-full opacity-80 blur-3xl"
        style={{
          background:
            "radial-gradient(ellipse at 50% 18%, rgba(0,170,111,0.11) 0%, rgba(0,170,111,0.035) 34%, transparent 68%)",
        }}
        aria-hidden
      />

      {/* Hero: v0 unified animated mark + wordmark (includes "Gallery" subline in SVG) */}
      <motion.div
        className="relative flex w-full max-w-sm flex-col items-center text-center sm:max-w-md"
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.85, ease: ONBOARDING_EASE }}
      >
        <RelayUnifiedLogoV0 size={220} />
      </motion.div>

      <motion.p
        className="mt-2 max-w-[42rem] px-4 text-balance text-center text-[0.68rem] font-bold uppercase leading-relaxed tracking-[0.24em] text-[var(--relay-electric)] sm:mt-3 sm:whitespace-nowrap sm:text-xs sm:tracking-[0.28em]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25, ease: ONBOARDING_EASE }}
      >
        Turn your Patreon feed into a Custom, Searchable Gallery
      </motion.p>

      {/* Path cards — compact decisions; education sits below. */}
      <motion.div
        className="w-full max-w-4xl space-y-4 pt-6 sm:pt-8"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.45, ease: ONBOARDING_EASE }}
      >
        <div
          className="grid w-full grid-cols-1 items-stretch gap-4 sm:grid-cols-2"
          aria-label="Choose creator or patron path"
        >
          <div className="h-full min-h-0 w-full min-w-0 self-stretch">
            <PathCard
              eyebrow="I make content"
              label="Creator"
              description={creatorPathCardDescription}
              icon={<CtaPersonIcon active="lead" />}
              onClick={() => onChoose("creator")}
              accent="green"
              className="h-full w-full min-h-[8.25rem] p-6"
              labelLayout="cta"
              ctaIconSide="right"
              motionDelay={0.58}
            />
          </div>
          <div className="h-full min-h-0 w-full min-w-0 self-stretch">
            <PathCard
              eyebrow="I support creators"
              label="Supporter"
              description={patronPathCardDescription}
              icon={<CtaPersonIcon active="follower" />}
              onClick={() => onChoose("supporter")}
              accent="green"
              className="h-full w-full min-h-[8.25rem] p-6"
              labelLayout="cta"
              ctaIconSide="left"
              motionDelay={0.68}
            />
          </div>
        </div>
      </motion.div>

      <RelayUpgradePanel />

      {/* Sub-CTA: tiny feature strip — what Relay does, at a glance */}
      <motion.ul
        className="grid w-full max-w-xl grid-cols-3 gap-4 text-[11px] text-[var(--relay-fg-muted)] sm:gap-8 sm:text-xs"
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.48, ease: ONBOARDING_EASE }}
      >
        <FeatureBullet
          icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />}
          label="Beautified galleries"
          delay={0}
        />
        <FeatureBullet
          icon={<Heart className="h-3.5 w-3.5" strokeWidth={1.75} />}
          label="Follow & collect"
          delay={0.06}
        />
        <FeatureBullet
          icon={<Compass className="h-3.5 w-3.5" strokeWidth={1.75} />}
          label="Discover artists"
          delay={0.12}
        />
      </motion.ul>

      <motion.p
        className="text-sm text-[var(--relay-fg-muted)]"
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.42, delay: 0.1, ease: ONBOARDING_EASE }}
      >
        Already signed up?{" "}
        <Link
          href="/login"
          className="font-medium text-[var(--relay-green-400)] underline-offset-4 hover:underline"
        >
          Log in
        </Link>
      </motion.p>
    </div>
  );
}

function FeatureBullet({
  icon,
  label,
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  delay?: number;
}) {
  return (
    <motion.li
      className="flex items-center justify-center gap-1.5"
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.36, delay, ease: ONBOARDING_EASE }}
    >
      <span className="text-[var(--relay-gold-400)]/75">{icon}</span>
      <span className="font-medium text-[var(--relay-fg)]/85">{label}</span>
    </motion.li>
  );
}

/* ── ARTSY FINTECH PATH PICKER (v1) ── END ───────────────────────────────── */

function PathCard({
  eyebrow,
  label,
  description,
  icon,
  onClick,
  accent,
  className,
  labelLayout = "stack",
  ctaIconSide = "left",
  motionDelay = 0,
}: {
  eyebrow?: string;
  label: string;
  description: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  accent: "gold" | "green";
  className?: string;
  /** `hero` — label beside icon, larger type (path picker creator card) */
  labelLayout?: "stack" | "hero" | "cta";
  ctaIconSide?: "left" | "right";
  motionDelay?: number;
}) {
  const isGold = accent === "gold";
  const isHero = labelLayout === "hero";
  const isCta = labelLayout === "cta";

  const iconBoxClass = cn(
    "relative flex shrink-0 items-center justify-center rounded-xl border transition-all duration-200",
    isCta
      ? "h-20 w-24 border-transparent bg-transparent text-[var(--relay-electric)] shadow-none [&_svg]:!h-[5rem] [&_svg]:!w-[5.5rem]"
      : isHero
      ? "h-10 w-10 [&_svg]:!h-[1.125rem] [&_svg]:!w-[1.125rem]"
      : "h-12 w-12",
    isCta
      ? "border-transparent bg-transparent text-[var(--relay-electric)] group-hover:border-transparent group-hover:shadow-none"
      : isGold
      ? "border-[var(--relay-gold-500)]/40 bg-[var(--relay-gold-500)]/10 text-[var(--relay-gold-400)] group-hover:border-[var(--relay-gold-400)]/60 group-hover:shadow-[0_0_16px_0_rgba(197,179,88,0.3)]"
      : "border-[var(--relay-green-800)] bg-[var(--relay-green-950)] text-[var(--relay-green-400)] group-hover:border-[var(--relay-electric)]/60 group-hover:shadow-[0_0_16px_0_var(--relay-glow-strong)]"
  );

  const titleClass = isHero
    ? "min-w-0 flex-1 text-balance text-2xl font-bold leading-[1.1] tracking-tight text-[var(--relay-fg)] sm:text-3xl"
    : isCta
      ? "text-3xl font-bold leading-none tracking-tight text-[var(--relay-fg)] sm:text-4xl"
    : "text-lg font-bold tracking-tight text-[var(--relay-fg)]";

  const descriptionBlock =
    typeof description === "string" ? (
      <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
        {description}
      </p>
    ) : (
      <div className="space-y-2.5">{description}</div>
    );

  const ButtonComponent = isCta ? motion.button : "button";
  const motionProps = isCta
    ? {
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.6, delay: motionDelay, ease: ONBOARDING_EASE },
        whileHover: { y: -4 },
        whileTap: { scale: 0.985 },
      }
    : {};

  return (
    <ButtonComponent
      type="button"
      onClick={onClick}
      {...motionProps}
      className={cn(
        "group relative flex min-w-0 flex-col items-start overflow-hidden rounded-2xl border p-7 text-left transition-all duration-250",
        isCta ? "justify-center gap-0" : isHero ? "gap-4" : "gap-5",
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

      {isCta ? (
        <div className="relative z-[1] flex w-full items-center gap-5">
          <div
            className={cn(
              "pointer-events-none absolute top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-[var(--relay-electric)]/10 blur-2xl opacity-55 transition-opacity duration-300 group-hover:opacity-95",
              ctaIconSide === "right" ? "-right-4" : "-left-4"
            )}
            aria-hidden
          />
          <div
            className={cn(
              "flex w-full items-center gap-5",
              ctaIconSide === "right" ? "flex-row-reverse" : "flex-row"
            )}
          >
            <div className={iconBoxClass}>{icon}</div>
            <div className="min-w-0 flex-1 space-y-3">
            {eyebrow ? (
              <p className="text-[0.64rem] font-bold uppercase leading-none tracking-[0.24em] text-[var(--relay-fg-muted)]">
                {eyebrow}
              </p>
            ) : null}
              <h3 className={titleClass}>{label}</h3>
              <div className="w-full">{descriptionBlock}</div>
            </div>
          </div>
        </div>
      ) : isHero ? (
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
    </ButtonComponent>
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
          { n: 2, label: "Username" },
          { n: 3, label: step2ConnectLabel },
          { n: 4, label: "Profile" },
          { n: 5, label: "Sync & Review" },
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(82,183,136,0.18)] bg-[rgba(82,183,136,0.07)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--relay-electric)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]">
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
          <SupporterSignInPanel onSuccess={onSignedIn} />
        )}
      </Suspense>

      <p className="text-center text-xs text-[var(--relay-fg-muted)]">
        We&apos;ll email you a magic link to verify the account — check your inbox right after submitting.
      </p>
    </div>
  );
}

export function StepRelayUsername({
  path,
  onAdvance
}: {
  path: OnboardingPath;
  onAdvance?: () => void;
}) {
  const isSupporter = path === "supporter";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [originalDisplayName, setOriginalDisplayName] = useState("");
  const [originalBio, setOriginalBio] = useState("");
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileWarning, setProfileWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await fetchPatronSessionIfPresent();
        if (cancelled) return;
        const sessionUsername = me?.username ?? "";
        setUsername(sessionUsername);

        if (isSupporter) {
          try {
            const profile = await fetchPatronProfileMe();
            if (cancelled) return;
            const nextDisplayName = profile.display_name ?? "";
            const nextBio = profile.bio ?? "";
            const sessionUsernameNorm = normalizeOnboardingUsername(sessionUsername);
            const displayMatchesUsername =
              !nextDisplayName.trim() ||
              nextDisplayName.trim().toLowerCase() === sessionUsernameNorm;
            setDisplayName(
              nextDisplayName.trim() || sessionUsernameNorm || nextDisplayName
            );
            setDisplayNameTouched(!displayMatchesUsername);
            setBio(nextBio);
            setOriginalDisplayName(nextDisplayName);
            setOriginalBio(nextBio);
          } catch {
            // Profile may not exist yet — optional fields stay empty.
            const sessionUsernameNorm = normalizeOnboardingUsername(sessionUsername);
            if (sessionUsernameNorm) {
              setDisplayName(sessionUsernameNorm);
            }
            setDisplayNameTouched(false);
          }
        }
      } catch {
        if (!cancelled) setError("Sign in first, then choose your Relay username.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSupporter]);

  const normalized = normalizeOnboardingUsername(username);
  const usernameOk =
    /^[a-z0-9][a-z0-9_-]{2,31}$/.test(normalized) && !isReservedPathSegment(normalized);
  const bioOver = bio.length > PATRON_PROFILE_BIO_UI_LIMIT;
  const displayNameOver = displayName.length > PATRON_PROFILE_DISPLAY_NAME_LIMIT;

  const handleSave = async () => {
    if (!usernameOk) {
      setError("Choose 3-32 characters: letters, numbers, underscore, or hyphen.");
      return;
    }
    if (isSupporter && (bioOver || displayNameOver)) {
      setError("Profile details exceed the allowed length.");
      return;
    }
    setSaving(true);
    setError(null);
    setProfileWarning(null);
    try {
      const saved = await patchRelayUsername(normalized);
      setUsername(saved.username);

      if (isSupporter) {
        const displayToSave = displayName.trim() || normalized;
        const displayDirty = displayToSave !== originalDisplayName.trim();
        const bioDirty = bio.trim() !== originalBio.trim();
        if (displayDirty || bioDirty) {
          try {
            await patchPatronProfileMe({
              display_name: displayToSave || null,
              bio: bio.trim() || null,
            });
          } catch {
            setProfileWarning(
              "Couldn't save profile details — you can edit them in Settings."
            );
          }
        }
      }

      onAdvance?.();
    } catch (e) {
      const msg =
        e instanceof RelayApiError
          ? e.status === 409
            ? "That Relay username is already taken."
            : e.message
          : e instanceof Error
            ? e.message
            : "Could not save username.";
      setError(msg);
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <StepBadge step={2} of={path === "creator" ? 5 : 4} />
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Choose your Relay username
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          {isSupporter
            ? "Your username is required — it's your @mention tag everywhere on Relay. Display name and bio are optional; you can change them later in Settings."
            : "This is your one alias everywhere on Relay. It becomes your profile name, your @mention tag, and the identity people use to find you here."}
        </p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="relay-username"
          className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]"
        >
          Relay username <span className="text-[var(--relay-green-400)]">*</span>
        </label>
        <div className="flex rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] focus-within:ring-2 focus-within:ring-[var(--relay-green-600)]/30">
          <span className="flex items-center px-3 text-sm text-[var(--relay-green-400)]">@</span>
          <input
            id="relay-username"
            type="text"
            value={username}
            disabled={loading || saving}
            onChange={(e) => {
              const next = e.target.value;
              setUsername(next);
              if (isSupporter && !displayNameTouched) {
                setDisplayName(normalizeOnboardingUsername(next));
              }
            }}
            placeholder="milo"
            className="min-w-0 flex-1 rounded-r-xl bg-transparent px-0 py-3 pr-3 text-sm text-[var(--relay-fg)] outline-none placeholder:text-[var(--relay-fg-muted)]"
            autoComplete="username"
            spellCheck={false}
          />
        </div>
        <p className="text-xs text-[var(--relay-fg-muted)]">
          {isSupporter
            ? "Username — your @handle for mentions and your profile URL."
            : "Username — your @handle for mentions and discovery on Relay."}
        </p>
        {normalized && !isSupporter ? (
          <p className="text-xs text-[var(--relay-fg-muted)]">
            Your Relay identity will be{" "}
            <span className="font-medium text-[var(--relay-green-400)]">@{normalized}</span>.
          </p>
        ) : null}
      </div>

      {isSupporter ? (
        <>
          <div className="space-y-2">
            <label
              htmlFor="supporter-display-name"
              className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]"
            >
              Display name
            </label>
            <input
              id="supporter-display-name"
              type="text"
              value={displayName}
              disabled={loading || saving}
              maxLength={PATRON_PROFILE_DISPLAY_NAME_LIMIT}
              onChange={(e) => {
                setDisplayNameTouched(true);
                setDisplayName(e.target.value);
              }}
              placeholder={normalized || "milo"}
              className="w-full rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-3 py-3 text-sm text-[var(--relay-fg)] outline-none placeholder:text-[var(--relay-fg-muted)] focus:ring-2 focus:ring-[var(--relay-green-600)]/30"
            />
            <p className="text-xs text-[var(--relay-fg-muted)]">
              Display name — your public-facing nametag on Relay. Matching your username is
              recommended, but you can change it anytime.
            </p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="supporter-bio"
              className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]"
            >
              Short bio
            </label>
            <textarea
              id="supporter-bio"
              value={bio}
              disabled={loading || saving}
              rows={3}
              onChange={(e) => setBio(e.target.value.slice(0, PATRON_PROFILE_BIO_UI_LIMIT))}
              placeholder="Optional — a line about you"
              className={[
                "w-full resize-none rounded-xl border bg-[var(--relay-surface-1)] px-3 py-3 text-sm text-[var(--relay-fg)] outline-none placeholder:text-[var(--relay-fg-muted)] focus:ring-2 focus:ring-[var(--relay-green-600)]/30",
                bioOver ? "border-red-900/50" : "border-[var(--relay-border)]",
              ].join(" ")}
            />
            <p
              className={[
                "text-xs",
                bioOver ? "text-red-300" : "text-[var(--relay-fg-muted)]",
              ].join(" ")}
            >
              {bio.length} / {PATRON_PROFILE_BIO_UI_LIMIT}
            </p>
          </div>
        </>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-200"
        >
          {error}
        </p>
      ) : null}

      {profileWarning ? (
        <p className="rounded-md border border-[#3a2a14] bg-[#1f1408] px-3 py-2 text-xs text-[#d39e6a]">
          {profileWarning}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={loading || saving || !usernameOk || bioOver || displayNameOver}
        className="flex items-center justify-center gap-2 rounded-xl bg-[var(--relay-green-600)] px-5 py-3 text-sm font-semibold text-[var(--relay-fg)] transition-colors hover:bg-[var(--relay-green-400)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Saving username...
          </>
        ) : (
          <>
            Save username
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </>
        )}
      </button>
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
    return fromEnv || (origin ? `${origin}/connect/patreon/callback` : "");
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
  const relayUsername =
    identity?.username_norm?.trim() || identity?.username?.trim().toLowerCase() || "";
  const publicSlugDraft = sanitizePublicSlugDraft(relayUsername || trimmedCreatorName);
  const publicSlugReserved = isReservedPathSegment(publicSlugDraft);
  const creatorNameOk = trimmedCreatorName.length > 0;
  const bioCount = bio.length;
  const bioOver = bioCount > PROFILE_BIO_LIMIT;
  const canSave =
    creatorNameOk && Boolean(relayUsername) && !bioOver && !avatarUploading && !publicSlugReserved;

  const isDirty = (field: keyof CreatorProfileIdentity, current: string): boolean => {
    const original = (identity?.[field] as string | null) ?? "";
    return current.trim() !== original.trim();
  };

  const buildPatch = () => {
    const patch: Record<string, string | null> = {};
    if (trimmedCreatorName !== (identity?.display_name ?? "").trim()) {
      patch.display_name = trimmedCreatorName || null;
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
    if (!relayUsername) {
      setError("Choose your Relay username before setting up your creator profile.");
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
          step={4}
          of={5}
          extra="Artists"
          icon={<Palette className="h-3 w-3" strokeWidth={2} />}
        />
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Build your Relay identity
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          {identity
            ? "We pulled what we could from Patreon. Confirm the display name and avatar for your creator profile."
            : "Add the display name patrons will see. Your Relay username is already your @ tag."}
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
            {relayUsername ? (
              <p className="text-xs text-[var(--relay-fg-muted)]">
                Patrons will see{" "}
                <span className="font-medium text-[var(--relay-fg)]">{trimmedCreatorName}</span>
                {" · "}
                <span className="text-[var(--relay-green-400)]">@{relayUsername}</span>
                {" · "}
                <span className="text-[var(--relay-green-400)]">/{publicSlugDraft}</span>
              </p>
            ) : trimmedCreatorName ? (
              <p className="text-xs text-[var(--relay-fg-muted)]">
                Choose your Relay username first; it becomes your @ tag everywhere.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]">
              Avatar image
            </p>
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
              </div>
            </div>
            <p className="text-xs text-[var(--relay-fg-muted)]">
              If Patreon provides an avatar, Relay uses it automatically. Upload a file to replace it.
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
          Your Relay username is your @ tag. This display name can be more descriptive.
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────────
 * Step 5 — Creator sync & review (detected platform signals + import choices).
 * ─────────────────────────────────────────────────────────────────────────── */

function normalizeOnboardingUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function sanitizePublicSlugDraft(raw: string): string {
  let s = raw.toLowerCase().replace(/_/g, "-").replace(/[^a-z0-9-]+/g, "-");
  s = s.replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (s.length > 32) {
    s = s.slice(0, 32).replace(/-+$/g, "");
  }
  return s;
}

export function StepClaimHandleAndGo() {
  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <StepBadge
          step={5}
          of={5}
          extra="Artists"
          icon={<Zap className="h-3 w-3" strokeWidth={2} />}
        />
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Sync &amp; Review
        </h2>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          Your creator profile is live. Confirm the signals, import your archive, then review
          the gallery Relay built for you.
        </p>
      </div>

      <CreatorImportReadinessPanel />

      <p className="text-center text-xs text-[var(--relay-fg-muted)]">
        Do you also support other creators on Patreon?{" "}
        <Link
          href="/onboarding?path=supporter&step=3"
          className="text-[var(--relay-green-400)] underline-offset-2 hover:underline"
        >
          Set up your Follower Feed
        </Link>
      </p>
    </div>
  );
}

export function StepSupporterReady() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [cadence, setCadence] = useState<NotificationCadencePreferenceId>("weekly");
  const [slot, setSlot] = useState<NotificationDigestSlotId>("evening");
  const [blockMatureContent, setBlockMatureContent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPatronProfileMe()
      .then((profile) => {
        if (cancelled) return;
        setEnabled(profile.notification_digest_enabled);
        setCadence(digestCadenceFromProfile(profile.notification_digest_cadence));
        setSlot(digestSlotFromProfile(profile.notification_digest_slot));
        setBlockMatureContent(profile.hide_mature_content);
      })
      .catch(() => {
        // Defaults are fine for first-time patrons.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openFeed = async () => {
    setSaving(true);
    setError(null);
    try {
      await patchPatronProfileMe({
        notification_digest_enabled: enabled,
        notification_digest_cadence: cadence,
        notification_digest_slot: slot,
        notification_digest_timezone: resolvedPatronDigestTimezone(null),
        hide_mature_content: blockMatureContent,
      });
      // Mark supporter onboarding complete so the creator CTA banner may show on the feed.
      try { localStorage.setItem("relay_supporter_onboarding_done", "1"); } catch { /* ignore */ }
      router.push("/feed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save notification preferences.");
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 py-1">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="max-w-md space-y-2">
          <StepBadge step={4} of={4} extra="You're in" />
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
            Your feed is ready
          </h2>
          <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
            Some final details...
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-[var(--relay-fg-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading preferences…
        </div>
      ) : (
        <div className="space-y-4">
          <fieldset
            className="space-y-3 rounded-2xl border border-[rgba(82,183,136,0.14)] bg-[linear-gradient(180deg,var(--relay-surface-1)_0%,var(--relay-surface-2)_100%)] p-3"
            disabled={saving}
          >
            <legend className="mx-auto px-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--relay-green-400)]">
              Should we block Mature Content from your feed?
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: true, label: "Yes" },
                { value: false, label: "No" },
              ].map((option) => {
                const selected = blockMatureContent === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setBlockMatureContent(option.value)}
                    className={[
                      "rounded-2xl border px-3 py-3 text-center text-[12px] font-semibold transition-all duration-150",
                      selected
                        ? "border-[var(--relay-electric)] bg-[linear-gradient(180deg,var(--relay-bg)_0%,var(--relay-surface-1)_220%)] text-[var(--relay-fg)] shadow-[inset_0_0_0_1px_rgba(82,183,136,0.22),0_10px_24px_-18px_var(--relay-glow)]"
                        : "border-[rgba(255,255,255,0.07)] bg-[linear-gradient(180deg,var(--relay-bg)_0%,var(--relay-surface-1)_260%)] text-[var(--relay-fg-muted)] hover:border-[rgba(82,183,136,0.3)] hover:text-[var(--relay-fg)]",
                      saving ? "cursor-not-allowed opacity-60" : ""
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <NotificationDigestPreferencesForm
            digestEnabled={enabled}
            cadence={cadence}
            slot={slot}
            disabled={saving}
            variant="onboarding"
            onDigestEnabledChange={setEnabled}
            onCadenceChange={setCadence}
            onSlotChange={setSlot}
          />
        </div>
      )}

      {error ? (
        <p role="alert" className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      ) : null}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => void openFeed()}
          disabled={loading || saving}
          className="group inline-flex items-center gap-2 rounded-xl bg-[var(--relay-electric)] px-7 py-3.5 text-sm font-bold text-white transition-colors duration-200 hover:bg-[var(--relay-green-600)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            <>
              Open my feed
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" strokeWidth={2.5} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
