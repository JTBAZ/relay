import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { RelayLogo } from "@/app/components/auth/relay-logo";
import { TrustMarks } from "@/app/components/auth/trust-marks";
import { StudioSupabaseSignInPanel } from "@/app/components/studio/StudioSupabaseSignInPanel";
import { PatreonOAuthLinks } from "@/app/components/auth/patreon-oauth-links";

export const metadata: Metadata = {
  title: "Relay · Sign in",
  description: "Sign in to your Relay studio, then connect Patreon to sync your library."
};

export default function LoginPage() {
  return (
    <div
      className="login-shell flex min-h-dvh flex-1 flex-col"
      style={{ background: "#0A0A0A", color: "#F9FAFB" }}
    >
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-10 px-4 py-10">
        <header className="flex flex-col items-center gap-3">
          <RelayLogo size="md" />
          <p className="text-center text-sm" style={{ color: "#9CA3AF" }}>
            Your creative intelligence platform
          </p>
        </header>

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
