"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { RelayLogo } from "@/app/components/auth/relay-logo";
import { bootstrapPilotUxPasswordLogin } from "@/lib/pilot-ux-password-login";
import {
  STUDIO_LAB2_DEFAULT_DEV_PASSWORD,
  STUDIO_LAB2_DESTINATION,
  STUDIO_LAB2_DEV_EMAIL,
  studioLab2DevLoginEnabled
} from "@/lib/studio-lab2-dev-login";

export function StudioLab2DevLoginClient() {
  const router = useRouter();
  const enabled = studioLab2DevLoginEnabled();
  const [password, setPassword] = useState(STUDIO_LAB2_DEFAULT_DEV_PASSWORD);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0A0A0A] px-4 text-[#F9FAFB]">
        <p className="max-w-md text-center text-sm text-[#9CA3AF]">
          Lab 2 local sign-in is disabled in production.
        </p>
        <Link href="/login" className="mt-6 text-sm text-[#52B788] hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  async function openLab2() {
    setError(null);
    setBusy(true);
    try {
      await bootstrapPilotUxPasswordLogin({
        email: STUDIO_LAB2_DEV_EMAIL,
        password,
        kind: "creator"
      });
      router.push(STUDIO_LAB2_DESTINATION);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#0A0A0A] text-[#F9FAFB]">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center gap-7 px-4 py-10">
        <header className="flex flex-col items-center gap-3">
          <RelayLogo size="md" />
          <h1 className="text-center text-lg font-semibold">Studio Lab 2</h1>
          <p className="text-center text-sm text-[#9CA3AF]">
            This playground uses a local test studio, not your personal Relay account. The usual
            creator sign-in will not work here.
          </p>
        </header>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[#9CA3AF]">Lab 2 password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-[#2A2A2A] bg-[#111111] px-3 py-2 text-[#F9FAFB] outline-none focus:border-[#52B788]"
            autoComplete="current-password"
          />
          <span className="text-xs text-[#6B7280]">
            Default is already filled in. Seed the playground first if sign-in fails.
          </span>
        </label>

        {error ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy || password.length < 6}
          onClick={() => void openLab2()}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#52B788] px-4 py-3 text-sm font-medium text-[#0A0A0A] transition-opacity disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Open Lab 2
        </button>

        <p className="text-center text-xs text-[#6B7280]">{STUDIO_LAB2_DEV_EMAIL}</p>

        <Link href="/login" className="text-center text-sm text-[#52B788] hover:underline">
          Personal Relay sign in
        </Link>
      </div>
    </div>
  );
}
