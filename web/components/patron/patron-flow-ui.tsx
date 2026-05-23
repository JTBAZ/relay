"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { TrustMarks } from "@/app/components/auth/trust-marks";

/** Shared dark patron onboarding / OAuth palette (matches /patron + feed shell). */
export const patronFlowColors = {
  pageBg: "#0A0A0A",
  pageFg: "#F9FAFB",
  muted: "#9CA3AF",
  subtle: "#6B7280",
  border: "#2A2A2A",
  cardBg: "#111111",
  accent: "#2D6A4F",
  accentHover: "#40916C",
  accentMuted: "#1B4332",
  warn: "#F59E0B",
  error: "#F87171"
} as const;

export function PatronFlowShell({
  title,
  subtitle,
  backHref = "/patron/feed",
  backLabel = "Back to feed",
  children,
  footer
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className="flex min-h-[calc(100dvh-56px)] flex-col"
      style={{ background: patronFlowColors.pageBg, color: patronFlowColors.pageFg }}
    >
      <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-6 px-4 py-8 sm:py-10">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: patronFlowColors.pageFg }}>
              {title}
            </h1>
            {subtitle ? (
              <p className="text-sm leading-relaxed" style={{ color: patronFlowColors.muted }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <Link
            href={backHref}
            className="text-xs transition-colors hover:underline"
            style={{ color: patronFlowColors.subtle }}
          >
            ← {backLabel}
          </Link>
        </header>

        <main aria-live="polite">{children}</main>

        {footer ?? <TrustMarks />}
      </div>
    </div>
  );
}

export function PatronFlowCard({
  icon,
  iconColor = patronFlowColors.accentHover,
  title,
  body,
  children
}: {
  icon?: ReactNode;
  iconColor?: string;
  title: string;
  body?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      className="space-y-4 rounded-xl border p-6"
      style={{
        background: patronFlowColors.cardBg,
        borderColor: patronFlowColors.border
      }}
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{
              background: patronFlowColors.pageBg,
              border: `1px solid ${iconColor}`
            }}
          >
            <span style={{ color: iconColor }}>{icon}</span>
          </span>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-base font-semibold" style={{ color: patronFlowColors.pageFg }}>
            {title}
          </h2>
          {body ? (
            <div className="text-sm leading-relaxed" style={{ color: patronFlowColors.muted }}>
              {body}
            </div>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function PatronFlowPrimaryButton({
  href,
  onClick,
  disabled,
  children
}: {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const className =
    "block w-full rounded-lg py-2.5 text-center text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90";
  const style = { background: patronFlowColors.accent, color: patronFlowColors.pageFg };

  if (href && !disabled) {
    return (
      <a href={href} className={className} style={style}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className} style={style}>
      {children}
    </button>
  );
}

export function PatronFlowSecondaryLink({
  href,
  children
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block text-center text-xs underline-offset-2 hover:underline"
      style={{ color: patronFlowColors.muted }}
    >
      {children}
    </Link>
  );
}

export function PatronFlowLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2 rounded-xl border py-10"
      style={{
        background: patronFlowColors.cardBg,
        borderColor: patronFlowColors.border,
        color: patronFlowColors.muted
      }}
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function PatronFlowNotice({
  tone = "info",
  children
}: {
  tone?: "info" | "warn" | "error";
  children: ReactNode;
}) {
  const border =
    tone === "error"
      ? "rgba(248,113,113,0.35)"
      : tone === "warn"
        ? "rgba(245,158,11,0.35)"
        : "rgba(64,145,108,0.35)";
  const bg =
    tone === "error"
      ? "rgba(127,29,29,0.25)"
      : tone === "warn"
        ? "rgba(120,53,15,0.2)"
        : "rgba(27,67,50,0.35)";
  return (
    <div
      className="rounded-xl border p-4 text-sm leading-relaxed"
      style={{ borderColor: border, background: bg, color: patronFlowColors.pageFg }}
      role="status"
    >
      {children}
    </div>
  );
}
