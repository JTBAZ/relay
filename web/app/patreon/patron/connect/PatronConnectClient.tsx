"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PATREON_PATRON_OAUTH_SCOPES } from "@/lib/patreon-patron-scopes";
import { patronPatronOAuthRedirectUri } from "@/lib/patron-patron-redirect-uri";
import { encodePatronOAuthState } from "@/lib/patron-oauth-state";

function PatronConnectInner() {
  const searchParams = useSearchParams();

  const [creatorId, setCreatorId] = useState(
    () => process.env.NEXT_PUBLIC_RELAY_CREATOR_ID?.trim() || "dev_creator"
  );
  const [campaignNumericId, setCampaignNumericId] = useState(() => {
    const fromEnv = process.env.NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID?.trim() ?? "";
    return fromEnv.replace(/\D/g, "");
  });

  useEffect(() => {
    const q = searchParams.get("campaign")?.replace(/\D/g, "") ?? "";
    if (q) setCampaignNumericId(q);
  }, [searchParams]);

  const clientId = process.env.NEXT_PUBLIC_PATREON_CLIENT_ID ?? "";
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

  const hasEnvCampaign = Boolean(process.env.NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID?.trim());

  return (
    <main className="mx-auto max-w-lg space-y-6 p-8 text-stone-200">
      <p>
        <Link href="/" className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300">
          ← Gallery
        </Link>
        {" · "}
        <Link
          href="/patreon/connect"
          className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300"
        >
          Creator connect
        </Link>
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
        Patron login (Patreon OAuth)
      </h1>
      <p className="text-sm text-stone-300">
        The next step is Patreon&apos;s own sign-in / consent screen. This page only builds that link:
        Relay must send your <code className="rounded bg-stone-800 px-1">creator_id</code> and{" "}
        <code className="rounded bg-stone-800 px-1">campaign</code> in OAuth{" "}
        <code className="rounded bg-stone-800 px-1">state</code> so the API can complete token exchange
        and sync tiers (<code className="rounded bg-stone-800 px-1">patreon_tier_*</code>).
      </p>
      <p className="text-sm text-stone-300">
        Scopes:{" "}
        <code className="rounded bg-stone-800 px-1 text-stone-200">{PATREON_PATRON_OAUTH_SCOPES}</code>
      </p>

      {!clientId.trim() ? (
        <p className="rounded border border-amber-600/50 bg-amber-950/40 p-3 text-sm text-amber-100">
          Set <code className="rounded bg-stone-900 px-1">NEXT_PUBLIC_PATREON_CLIENT_ID</code> in{" "}
          <code className="rounded bg-stone-900 px-1">web/.env.local</code>.
        </p>
      ) : !campaignNumericId.trim() ? (
        <p className="text-sm text-stone-400">
          Set <code className="rounded bg-stone-800 px-1">NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID</code> in{" "}
          <code className="rounded bg-stone-800 px-1">web/.env.local</code>, add{" "}
          <code className="rounded bg-stone-800 px-1">?campaign=…</code> to this URL, or enter the numeric
          campaign id below.
        </p>
      ) : !redirectUri ? (
        <p className="text-sm text-stone-400">Preparing OAuth link…</p>
      ) : (
        <div className="space-y-2 rounded-lg border border-amber-600/30 bg-stone-900/50 p-4">
          <p className="text-sm font-medium text-stone-100">Continue on Patreon</p>
          <a
            href={authorizeUrl}
            className="inline-block rounded bg-amber-500 px-4 py-2.5 text-sm font-medium text-stone-950 hover:bg-amber-400"
          >
            Continue with Patreon
          </a>
          <p className="text-xs text-stone-500">
            Opens <code className="rounded bg-stone-800 px-1">patreon.com/oauth2/authorize</code> — the
            real OAuth step.
          </p>
        </div>
      )}

      <details className="rounded-lg border border-stone-700 bg-stone-900/40 p-3 text-sm text-stone-400">
        <summary className="cursor-pointer font-medium text-stone-300">
          Advanced / dev overrides
        </summary>
        <div className="mt-4 space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-stone-200">Relay creator_id</span>
            <input
              className="w-full rounded border border-stone-600 bg-stone-100 px-3 py-2 text-stone-900 placeholder:text-stone-500"
              value={creatorId}
              onChange={(e) => setCreatorId(e.target.value)}
              placeholder="dev_creator"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-stone-200">Patreon numeric campaign id</span>
            <input
              className="w-full rounded border border-stone-600 bg-stone-100 px-3 py-2 text-stone-900 placeholder:text-stone-500"
              value={campaignNumericId}
              onChange={(e) => setCampaignNumericId(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 12345678"
            />
            <span className="text-xs text-stone-500">
              Pre-filled from env when{" "}
              <code className="rounded bg-stone-800 px-1">NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID</code> is
              set{hasEnvCampaign ? " (active)" : ""}. URL query{" "}
              <code className="rounded bg-stone-800 px-1">?campaign=</code> overrides once on load.
            </span>
          </label>
        </div>
      </details>

      <p className="text-xs text-stone-400">
        Redirect URI registered in Patreon:{" "}
        {redirectUri ? (
          <code className="break-all rounded bg-stone-800 px-1.5 py-0.5 text-amber-200">
            {redirectUri}
          </code>
        ) : (
          <span className="text-amber-300">…</span>
        )}
        <br />
        Optional env:{" "}
        <code className="rounded bg-stone-800 px-1 text-stone-200">
          NEXT_PUBLIC_PATREON_PATRON_REDIRECT_URI
        </code>
      </p>
      <p className="text-xs text-stone-500">
        Exchange:{" "}
        <code className="rounded bg-stone-800 px-1">POST /api/v1/auth/patreon/patron/exchange</code>
      </p>
    </main>
  );
}

export function PatronConnectClient() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg p-8 text-stone-400">
          <p className="text-sm">Loading…</p>
        </main>
      }
    >
      <PatronConnectInner />
    </Suspense>
  );
}
