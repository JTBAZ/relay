"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import RelayUnifiedLogoV0 from "@/app/components/relay-unified-logo-v0";
import { StudioSupabaseSignInPanel } from "@/app/components/studio/StudioSupabaseSignInPanel";
import { SupporterSignInPanel } from "@/app/components/auth/SupporterSignInPanel";

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
      style={{ background: "var(--relay-bg)", color: "var(--relay-fg)" }}
    >
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center gap-7 px-4 py-10">
        <header className="flex flex-col items-center">
          <RelayUnifiedLogoV0 size={104} />
        </header>

        <div
          className="flex rounded-2xl border p-1"
          style={{ background: "var(--relay-surface-1)", borderColor: "var(--relay-border)" }}
          role="tablist"
          aria-label="Sign in as"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "creator"}
            className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === "creator" ? "bg-[var(--relay-green-600)] text-[var(--relay-fg)]" : "text-[var(--relay-fg-muted)] hover:text-[var(--relay-fg)]"
            }`}
            onClick={() => setTab("creator")}
          >
            Creator
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "supporter"}
            className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === "supporter" ? "bg-[var(--relay-green-600)] text-[var(--relay-fg)]" : "text-[var(--relay-fg-muted)] hover:text-[var(--relay-fg)]"
            }`}
            onClick={() => setTab("supporter")}
          >
            Supporter
          </button>
        </div>

        {tab === "creator" ? (
          <section aria-labelledby="studio-heading" className="space-y-4">
            <div className="space-y-1 text-center">
              <h1 id="studio-heading" className="font-sans text-xl font-semibold" style={{ color: "var(--relay-fg)" }}>
                Welcome back
              </h1>
              <p className="text-sm" style={{ color: "var(--relay-fg-muted)" }}>
                Sign in as a creator to open your Library.
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
        ) : (
          <section aria-labelledby="supporter-heading" className="space-y-4">
            <div className="space-y-1 text-center">
              <h1 id="supporter-heading" className="font-sans text-xl font-semibold" style={{ color: "var(--relay-fg)" }}>
                Welcome back
              </h1>
              <p className="text-sm" style={{ color: "var(--relay-fg-muted)" }}>
                Sign in as a supporter to open your feed.
              </p>
            </div>

            <Suspense fallback={<p className="text-center text-xs text-[var(--relay-fg-muted)]">Loading...</p>}>
              <SupporterSignInPanel />
            </Suspense>
          </section>
        )}

        <p className="text-center text-xs" style={{ color: "#6B7280" }}>
          Need help?{" "}
          <a
            href="mailto:support@relay.example"
            className="underline transition-colors"
            style={{ color: "var(--relay-fg-muted)" }}
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
