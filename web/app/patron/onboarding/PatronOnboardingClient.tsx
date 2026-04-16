"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PATREON_PATRON_OAUTH_SCOPES } from "@/lib/patreon-patron-scopes";
import { patronPatronOAuthRedirectUri } from "@/lib/patron-patron-redirect-uri";
import { encodePatronOAuthState } from "@/lib/patron-oauth-state";

function PatronOnboardingInner({ initialClientId }: { initialClientId: string }) {
  const searchParams = useSearchParams();

  const [creatorId] = useState(() => process.env.NEXT_PUBLIC_RELAY_CREATOR_ID?.trim() || "dev_creator");
  const [campaignNumericId, setCampaignNumericId] = useState(() => {
    const fromEnv = process.env.NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID?.trim() ?? "";
    return fromEnv.replace(/\D/g, "");
  });

  useEffect(() => {
    const q = searchParams.get("campaign")?.replace(/\D/g, "") ?? "";
    if (q) setCampaignNumericId(q);
  }, [searchParams]);

  const clientId = initialClientId;
  const redirectUri = patronPatronOAuthRedirectUri();

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
        patreon_campaign_numeric_id: campaignNumericId.trim()
      })
    );
    return u.toString();
  }, [clientId, redirectUri, creatorId, campaignNumericId]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-4 py-12">
      <div className="space-y-2 text-center">
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-[var(--relay-fg)]">
          Connect your Patreon to get started
        </h1>
        <p className="text-sm leading-relaxed text-[var(--relay-fg-muted)]">
          You&apos;ll sign in on Patreon and return here with your supporter access synced.
        </p>
      </div>

      {!clientId.trim() ? (
        <p className="rounded-lg border border-amber-600/50 bg-amber-950/40 p-4 text-sm text-amber-100">
          Set <code className="rounded bg-stone-900 px-1">PATREON_CLIENT_ID</code> or{" "}
          <code className="rounded bg-stone-900 px-1">NEXT_PUBLIC_PATREON_CLIENT_ID</code> in{" "}
          <code className="rounded bg-stone-900 px-1">web/.env.local</code>.
        </p>
      ) : !campaignNumericId.trim() ? (
        <p className="rounded-lg border border-[var(--relay-border)] bg-[var(--relay-surface-2)] p-4 text-sm text-[var(--relay-fg-muted)]">
          Set <code className="rounded bg-[var(--relay-surface)] px-1">NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID</code>{" "}
          or open this page with <code className="rounded bg-[var(--relay-surface)] px-1">?campaign=…</code>.
        </p>
      ) : !redirectUri ? (
        <p className="text-center text-sm text-[var(--relay-fg-muted)]">Preparing Patreon link…</p>
      ) : (
        <a
          href={authorizeUrl}
          className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--relay-green-600)] px-6 py-3.5 text-center text-sm font-semibold text-[var(--relay-fg)] transition-colors hover:bg-[var(--relay-green-400)]"
        >
          Continue with Patreon
        </a>
      )}

      <p className="text-center text-xs text-[var(--relay-fg-muted)]">
        <Link href="/login" className="text-[var(--relay-green-400)] underline-offset-2 hover:underline">
          Back to sign in
        </Link>
        {" · "}
        <Link href="/landing" className="text-[var(--relay-green-400)] underline-offset-2 hover:underline">
          Landing
        </Link>
      </p>
    </div>
  );
}

export function PatronOnboardingClient({ initialClientId }: { initialClientId: string }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--relay-fg-muted)]">
          Loading…
        </div>
      }
    >
      <PatronOnboardingInner initialClientId={initialClientId} />
    </Suspense>
  );
}
