"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RelayLogo } from "@/app/components/auth/relay-logo";
import { TrustMarks } from "@/app/components/auth/trust-marks";
import { StudioSupabaseSignInPanel } from "@/app/components/studio/StudioSupabaseSignInPanel";
import { SupporterSignInPanel } from "@/app/components/auth/SupporterSignInPanel";
import { PatreonOAuthLinks } from "@/app/components/auth/patreon-oauth-links";

type RoleTab = "creator" | "supporter";

function LoginPageInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<RoleTab>("creator");

  useEffect(() => {
    const role = searchParams.get("role")?.trim().toLowerCase();
    if (role === "supporter") setTab("supporter");
  }, [searchParams]);

  return (
    <div
      className="login-shell flex min-h-dvh flex-1 flex-col"
      style={{ background: "#0A0A0A", color: "#F9FAFB" }}
    >
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-8 px-4 py-10">
        <header className="flex flex-col items-center gap-3">
          <RelayLogo size="md" />
          <p className="text-center text-sm" style={{ color: "#9CA3AF" }}>
            Your creative intelligence platform
          </p>
        </header>

        <div
          className="flex rounded-lg border p-1"
          style={{ background: "#111111", borderColor: "#2A2A2A" }}
          role="tablist"
          aria-label="Sign in as"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "creator"}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === "creator" ? "bg-[#2D6A4F] text-[#F9FAFB]" : "text-[#9CA3AF] hover:text-[#E5E7EB]"
            }`}
            onClick={() => setTab("creator")}
          >
            Creator
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "supporter"}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === "supporter" ? "bg-[#2D6A4F] text-[#F9FAFB]" : "text-[#9CA3AF] hover:text-[#E5E7EB]"
            }`}
            onClick={() => setTab("supporter")}
          >
            Supporter
          </button>
        </div>

        {tab === "creator" ? (
          <>
            <section aria-labelledby="studio-heading" className="space-y-3">
              <div className="space-y-1 text-center">
                <h1 id="studio-heading" className="font-sans text-lg font-semibold" style={{ color: "#F9FAFB" }}>
                  Sign in to your studio
                </h1>
                <p className="text-xs leading-relaxed" style={{ color: "#9CA3AF" }}>
                  Creates your <strong style={{ color: "#E5E7EB" }}>Relay account</strong> (stored in our database),
                  provisions your workspace, and saves your session so you can open your{" "}
                  <strong style={{ color: "#E5E7EB" }}>Library</strong> at the site home. Your studio is tied to your
                  account; Patreon OAuth below syncs posts after you&apos;re signed in.
                </p>
              </div>
              <div id="relay-studio">
                <Suspense
                  fallback={<p className="text-center text-xs text-[#6b7280]">Loading studio sign-in…</p>}
                >
                  <StudioSupabaseSignInPanel variant="login" />
                </Suspense>
              </div>
            </section>

            <section
              className="space-y-4 rounded-xl border p-6"
              style={{ background: "#111111", borderColor: "#2A2A2A" }}
              aria-labelledby="patreon-heading"
            >
              <div className="space-y-1">
                <h2 id="patreon-heading" className="font-sans text-sm font-semibold" style={{ color: "#F9FAFB" }}>
                  Connect Patreon
                </h2>
                <p className="text-xs" style={{ color: "#6B7280" }}>
                  Not a second login — this authorizes Patreon after you have a studio session.
                </p>
              </div>
              <PatreonOAuthLinks />
            </section>

            <p className="text-center text-xs leading-relaxed" style={{ color: "#6B7280" }}>
              <Link href="/onboarding" className="text-[#9CA3AF] underline-offset-2 hover:text-[#40916C] hover:underline">
                Full onboarding wizard
              </Link>
              {" · "}
              <Link href="/landing" className="text-[#9CA3AF] underline-offset-2 hover:text-[#40916C] hover:underline">
                Back to landing
              </Link>
            </p>
          </>
        ) : (
          <section aria-labelledby="supporter-heading" className="space-y-5">
            <div className="space-y-1 text-center">
              <h1 id="supporter-heading" className="font-sans text-lg font-semibold" style={{ color: "#F9FAFB" }}>
                Join as a supporter
              </h1>
              <p className="text-xs leading-relaxed" style={{ color: "#9CA3AF" }}>
                Create a verified Relay account, then connect your Patreon to access
                your supporter feed — no extra subscription.
              </p>
            </div>

            {/* Step 1: email + password account */}
            <div className="space-y-1">
              <p className="text-xs font-medium" style={{ color: "#6B7280" }}>
                Step 1 — Create or sign in to your Relay account
              </p>
              <Suspense fallback={<p className="text-center text-xs text-[#6b7280]">Loading…</p>}>
                <SupporterSignInPanel />
              </Suspense>
            </div>

            {/* Step 2: shown as context — the connect page handles the actual OAuth */}
            <div
              className="rounded-xl border p-4 space-y-2"
              style={{ background: "#111111", borderColor: "#2A2A2A" }}
            >
              <p className="text-xs font-medium" style={{ color: "#6B7280" }}>
                Step 2 — Link your Patreon (after sign-in)
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "#9CA3AF" }}>
                Once you&apos;re signed in you&apos;ll be taken to the Patreon connect
                page. Your tiers and feed are synced automatically.
              </p>
            </div>
          </section>
        )}

        <TrustMarks />

        <p className="text-center text-xs" style={{ color: "#6B7280" }}>
          Need help?{" "}
          <a
            href="mailto:support@relay.example"
            className="underline transition-colors"
            style={{ color: "#9CA3AF" }}
          >
            Contact support
          </a>
        </p>
      </div>
    </div>
  );
}

export function LoginPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh flex-1 items-center justify-center text-sm" style={{ color: "#9CA3AF" }}>
          Loading sign in…
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
