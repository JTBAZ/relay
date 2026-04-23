"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  LogIn,
  MailCheck,
  Plug,
  Rss,
  ShieldAlert
} from "lucide-react";
import { RelayLogo } from "@/app/components/auth/relay-logo";
import { TrustMarks } from "@/app/components/auth/trust-marks";
import {
  fetchPatronSessionIfPresent,
  type PatronSessionMe
} from "@/lib/relay-api";

/**
 * The four canonical gate states for a supporter landing on Relay.
 * `loading` and `error` are transient.
 */
type GateState =
  | "loading"
  | "signed-out"
  | "unverified"
  | "connect"
  | "ready"
  | "error";

const DEV_OVERRIDES = new Set<GateState>([
  "signed-out",
  "unverified",
  "connect",
  "ready"
]);

function isDevToolsEnabled(): boolean {
  return (
    (process.env.NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS ?? "")
      .toString()
      .toLowerCase() === "true"
  );
}

function deriveGate(session: PatronSessionMe | null): GateState {
  if (!session) return "signed-out";
  if (session.email_verified === false) return "unverified";
  if (!session.patreon_user_id) return "connect";
  return "ready";
}

export function PatronStartClient() {
  const search = useSearchParams();
  const overrideRaw = search.get("state");
  const override =
    overrideRaw && DEV_OVERRIDES.has(overrideRaw as GateState)
      ? (overrideRaw as GateState)
      : null;
  const devTools = isDevToolsEnabled();

  const [gate, setGate] = useState<GateState>(override ?? "loading");
  const [session, setSession] = useState<PatronSessionMe | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (override) {
      setGate(override);
      return;
    }
    let cancelled = false;
    setGate("loading");
    fetchPatronSessionIfPresent()
      .then((me) => {
        if (cancelled) return;
        setSession(me);
        setGate(deriveGate(me));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorText(err instanceof Error ? err.message : String(err));
        setGate("error");
      });
    return () => {
      cancelled = true;
    };
  }, [override]);

  return (
    <div
      className="flex min-h-dvh flex-col"
      style={{ background: "#0A0A0A", color: "#F9FAFB" }}
    >
      <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-8 px-4 py-10">
        <header className="flex flex-col items-center gap-3">
          <RelayLogo size="md" />
          <p className="text-center text-sm" style={{ color: "#9CA3AF" }}>
            {sessionEmailLine(session, gate)}
          </p>
        </header>

        <ProgressStepper gate={gate} />

        <main aria-live="polite">
          {gate === "loading" ? <GateLoading /> : null}
          {gate === "error" ? <GateError message={errorText} /> : null}
          {gate === "signed-out" ? <GateSignedOut /> : null}
          {gate === "unverified" ? <GateUnverified email={session?.email ?? null} /> : null}
          {gate === "connect" ? <GateConnect /> : null}
          {gate === "ready" ? <GateReady /> : null}
        </main>

        <TrustMarks />

        {devTools ? <DevStateSwitcher current={override ?? "(live)"} /> : null}
      </div>
    </div>
  );
}

function sessionEmailLine(
  session: PatronSessionMe | null,
  gate: GateState
): string {
  if (gate === "loading") return "Checking your supporter status…";
  if (gate === "error") return "We couldn't reach the Relay API.";
  if (gate === "signed-out") return "Sign in to unlock your supporter feed.";
  if (session?.email) return `Signed in as ${session.email}`;
  return "Welcome back, supporter.";
}

function ProgressStepper({ gate }: { gate: GateState }) {
  const order: GateState[] = ["signed-out", "unverified", "connect", "ready"];
  const currentIndex =
    gate === "loading" || gate === "error"
      ? -1
      : Math.max(0, order.indexOf(gate));
  const steps: { id: GateState; label: string }[] = [
    { id: "signed-out", label: "Sign in" },
    { id: "unverified", label: "Verify email" },
    { id: "connect", label: "Connect Patreon" },
    { id: "ready", label: "Open feed" }
  ];
  return (
    <ol
      className="flex items-center justify-between gap-2"
      aria-label="Supporter onboarding progress"
    >
      {steps.map((step, idx) => {
        const reached = currentIndex >= 0 && idx <= currentIndex;
        const done = currentIndex >= 0 && idx < currentIndex;
        return (
          <li
            key={step.id}
            className="flex flex-1 items-center gap-2"
            aria-current={idx === currentIndex ? "step" : undefined}
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
              style={{
                background: reached ? "#2D6A4F" : "#1A1A1A",
                color: reached ? "#F9FAFB" : "#6B7280",
                border: "1px solid",
                borderColor: reached ? "#40916C" : "#2A2A2A"
              }}
            >
              {done ? "✓" : idx + 1}
            </span>
            <span
              className="text-[11px] leading-tight"
              style={{
                color: idx === currentIndex ? "#E5E7EB" : "#6B7280",
                fontWeight: idx === currentIndex ? 600 : 400
              }}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function GateCard({
  icon,
  iconColor,
  title,
  body,
  cta,
  secondary
}: {
  icon: ReactNode;
  iconColor: string;
  title: string;
  body: ReactNode;
  cta: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section
      className="space-y-4 rounded-xl border p-6"
      style={{ background: "#111111", borderColor: "#2A2A2A" }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: "#0d0d0d", border: `1px solid ${iconColor}` }}
        >
          <span style={{ color: iconColor }}>{icon}</span>
        </span>
        <div className="space-y-1">
          <h2 className="text-base font-semibold" style={{ color: "#F9FAFB" }}>
            {title}
          </h2>
          <div className="text-sm leading-relaxed" style={{ color: "#9CA3AF" }}>
            {body}
          </div>
        </div>
      </div>
      <Link
        href={cta.href}
        className="block w-full rounded-lg py-2.5 text-center text-sm font-medium transition-opacity hover:opacity-90"
        style={{ background: "#2D6A4F", color: "#F9FAFB" }}
      >
        {cta.label}
      </Link>
      {secondary ? (
        <Link
          href={secondary.href}
          className="block text-center text-xs underline-offset-2 hover:underline"
          style={{ color: "#9CA3AF" }}
        >
          {secondary.label}
        </Link>
      ) : null}
    </section>
  );
}

function GateLoading() {
  return (
    <div
      className="flex items-center justify-center gap-2 rounded-xl border py-10"
      style={{ background: "#111111", borderColor: "#2A2A2A", color: "#9CA3AF" }}
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span className="text-sm">Checking your status…</span>
    </div>
  );
}

function GateError({ message }: { message: string | null }) {
  return (
    <GateCard
      icon={<ShieldAlert size={18} aria-hidden />}
      iconColor="#F87171"
      title="We couldn't reach Relay"
      body={
        <>
          <p>
            {message ??
              "The Relay API didn't respond. Make sure it's running locally."}
          </p>
          <p className="mt-2 text-xs" style={{ color: "#6B7280" }}>
            From the repo root: <code className="rounded bg-black/40 px-1">npm start</code>{" "}
            (then refresh).
          </p>
        </>
      }
      cta={{ href: "/patron", label: "Retry" }}
      secondary={{ href: "/login?role=supporter", label: "Sign in instead" }}
    />
  );
}

function GateSignedOut() {
  return (
    <GateCard
      icon={<LogIn size={18} aria-hidden />}
      iconColor="#C5B358"
      title="Sign in to continue"
      body={
        <p>
          Create a Relay supporter account or sign in. After your email is
          verified you&apos;ll connect Patreon to unlock your feed.
        </p>
      }
      cta={{ href: "/login?role=supporter", label: "Sign in / create account" }}
      secondary={{ href: "/landing", label: "Back to landing" }}
    />
  );
}

function GateUnverified({ email }: { email: string | null }) {
  return (
    <GateCard
      icon={<MailCheck size={18} aria-hidden />}
      iconColor="#F59E0B"
      title="Verify your email"
      body={
        <>
          <p>
            We sent a verification link to{" "}
            <strong style={{ color: "#E5E7EB" }}>{email ?? "your inbox"}</strong>.
            Click it to activate your supporter account.
          </p>
          <p className="mt-2 text-xs" style={{ color: "#6B7280" }}>
            Already clicked it? Refresh this page. The Patreon connect step
            unlocks once your email is verified.
          </p>
        </>
      }
      cta={{ href: "/patron", label: "I verified — refresh" }}
      secondary={{ href: "/login?role=supporter", label: "Sign in with a different account" }}
    />
  );
}

function GateConnect() {
  return (
    <GateCard
      icon={<Plug size={18} aria-hidden />}
      iconColor="#40916C"
      title="Connect your Patreon"
      body={
        <p>
          Your Relay account is ready. Link your Patreon now so we can sync your
          tier and load posts from creators you support.
        </p>
      }
      cta={{ href: "/patreon/patron/connect", label: "Connect Patreon" }}
      secondary={{ href: "/patron/feed", label: "Skip for now (limited preview)" }}
    />
  );
}

function GateReady() {
  return (
    <GateCard
      icon={<CheckCircle2 size={18} aria-hidden />}
      iconColor="#40916C"
      title="You're all set"
      body={
        <p>
          Your Patreon is linked and your tier is current. Open your supporter
          feed to see posts from the creators you support.
        </p>
      }
      cta={{ href: "/patron/feed", label: "Open your feed" }}
      secondary={{ href: "/patron/profile", label: "Edit profile" }}
    />
  );
}

function DevStateSwitcher({ current }: { current: string }) {
  const options: { id: GateState; label: string }[] = [
    { id: "signed-out", label: "Signed out" },
    { id: "unverified", label: "Unverified" },
    { id: "connect", label: "Needs Patreon" },
    { id: "ready", label: "Ready" }
  ];
  return (
    <div
      className="rounded-lg border px-3 py-3 text-[11px]"
      style={{ background: "#0d0d0d", borderColor: "#2A2A2A", color: "#6B7280" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <Rss size={11} aria-hidden />
        <span className="uppercase tracking-wide">Dev gate switcher</span>
        <span className="ml-auto" style={{ color: "#9CA3AF" }}>
          current: {current}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Link
          href="/patron"
          className="rounded border px-2 py-1 transition-colors hover:border-[#40916C] hover:text-[#E5E7EB]"
          style={{ borderColor: "#2A2A2A" }}
        >
          live
        </Link>
        {options.map((opt) => (
          <Link
            key={opt.id}
            href={`/patron?state=${opt.id}`}
            className="rounded border px-2 py-1 transition-colors hover:border-[#40916C] hover:text-[#E5E7EB]"
            style={{ borderColor: "#2A2A2A" }}
          >
            {opt.label}
          </Link>
        ))}
      </div>
      <p className="mt-2 leading-relaxed">
        Hidden in production (NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS).
      </p>
    </div>
  );
}
