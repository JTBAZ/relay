"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { RelayLogo } from "@/app/components/auth/relay-logo";
import { bootstrapPilotUxPasswordLogin } from "@/lib/pilot-ux-password-login";
import { postPilotUxOnboardingWalkthroughReset } from "@/lib/relay-api";
import {
  PILOT_UX_DEFAULT_DEV_PASSWORD,
  PILOT_UX_DEV_ACCOUNTS,
  pilotUxDevLoginEnabled
} from "@/lib/pilot-ux-dev-accounts";

export function PilotUxDevLoginClient() {
  const router = useRouter();
  const enabled = pilotUxDevLoginEnabled();
  const [password, setPassword] = useState(PILOT_UX_DEFAULT_DEV_PASSWORD);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0A0A0A] px-4 text-[#F9FAFB]">
        <p className="max-w-md text-center text-sm text-[#9CA3AF]">
          Pilot UX dev login is disabled in production. Set{" "}
          <code className="text-[#E5E7EB]">NEXT_PUBLIC_RELAY_PILOT_UX_DEV_LOGIN=true</code> to enable.
        </p>
        <Link href="/login" className="mt-6 text-sm text-[#52B788] hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  async function signInAs(account: (typeof PILOT_UX_DEV_ACCOUNTS)[number]) {
    setError(null);
    setBusyId(account.legacyFileId);
    try {
      await bootstrapPilotUxPasswordLogin({
        email: account.email,
        password,
        kind: account.kind
      });
      if (account.onboardingWalkthrough) {
        await postPilotUxOnboardingWalkthroughReset();
      }
      router.push(account.destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#0A0A0A] text-[#F9FAFB]">
      <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-8 px-4 py-10">
        <header className="flex flex-col items-center gap-3">
          <RelayLogo size="md" />
          <h1 className="text-center text-lg font-semibold">Pilot UX dev login</h1>
          <p className="text-center text-sm text-[#9CA3AF]">
            Password sign-in for seeded faux creators and patron — no Supabase or Patreon OAuth.
            Run <code className="text-[#D1D5DB]">npm run seed:pilot-ux</code> first.
          </p>
        </header>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[#9CA3AF]">Dev password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-[#2A2A2A] bg-[#111111] px-3 py-2 text-[#F9FAFB] outline-none focus:border-[#52B788]"
            autoComplete="current-password"
          />
          <span className="text-xs text-[#6B7280]">
            Override via <code>RELAY_PILOT_UX_DEV_PASSWORD</code> in API <code>.env</code>.
          </span>
        </label>

        {error ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          {PILOT_UX_DEV_ACCOUNTS.map((account) => (
            <button
              key={account.legacyFileId}
              type="button"
              disabled={busyId != null || password.length < 6}
              onClick={() => void signInAs(account)}
              className="flex items-center justify-between rounded-xl border border-[#2A2A2A] bg-[#111111] px-4 py-3 text-left transition-colors hover:border-[#52B788]/50 disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-medium">{account.displayName}</span>
                <span className="block text-xs text-[#9CA3AF]">{account.email}</span>
                <span className="mt-0.5 block text-[0.65rem] uppercase tracking-wide text-[#6B7280]">
                  {account.onboardingWalkthrough
                    ? "Creator onboarding walkthrough"
                    : account.kind === "creator"
                      ? "Creator library"
                      : "Patron feed"}
                </span>
              </span>
              {busyId === account.legacyFileId ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#52B788]" aria-hidden />
              ) : null}
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-[#6B7280]">
          Creators open Library with tier chips (read-only for Patreon posts). Patron follows both creators
          with seeded entitlements — permission parity is UX Gate B (PUX-002).
        </p>

        <Link href="/login" className="text-center text-sm text-[#52B788] hover:underline">
          Standard sign in
        </Link>
      </div>
    </div>
  );
}
