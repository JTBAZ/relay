"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PATREON_PATRON_OAUTH_SCOPES } from "@/lib/patreon-patron-scopes";
import { encodePatronOAuthState } from "@/lib/patron-oauth-state";

function patronRedirectUriForOAuth(): string {
  const fromEnv = process.env.NEXT_PUBLIC_PATREON_PATRON_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/patreon/patron/callback`;
}

export default function PatreonPatronConnectPage() {
  const [creatorId, setCreatorId] = useState("dev_creator");
  const [campaignNumericId, setCampaignNumericId] = useState("");

  const clientId = process.env.NEXT_PUBLIC_PATREON_CLIENT_ID ?? "";
  const redirectUri = patronRedirectUriForOAuth();

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
        Uses scopes{" "}
        <code className="rounded bg-stone-800 px-1 text-stone-200">{PATREON_PATRON_OAUTH_SCOPES}</code>.
        After approval, Relay syncs your entitled tier ids for the campaign below (same as creator
        member sync: <code className="rounded bg-stone-800 px-1">patreon_tier_*</code>) and returns a
        gallery session token.
      </p>
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
        <span className="text-sm font-medium text-stone-200">
          Patreon numeric campaign id
        </span>
        <input
          className="w-full rounded border border-stone-600 bg-stone-100 px-3 py-2 text-stone-900 placeholder:text-stone-500"
          value={campaignNumericId}
          onChange={(e) => setCampaignNumericId(e.target.value.replace(/\D/g, ""))}
          placeholder="e.g. 12345678 (from patreon_campaign_…)"
        />
        <span className="text-xs text-stone-400">
          Same number as in canonical <code className="rounded bg-stone-800 px-1">patreon_campaign_ID</code>.
        </span>
      </label>
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
      {!clientId.trim() ? (
        <p className="rounded border border-amber-600/50 bg-amber-950/40 p-3 text-sm text-amber-100">
          Set <code className="rounded bg-stone-900 px-1">NEXT_PUBLIC_PATREON_CLIENT_ID</code> in{" "}
          <code className="rounded bg-stone-900 px-1">web/.env.local</code>.
        </p>
      ) : !campaignNumericId.trim() ? (
        <p className="text-sm text-stone-400">Enter your Patreon campaign numeric id to enable the link.</p>
      ) : !redirectUri ? (
        <p className="text-sm text-stone-400">Preparing OAuth link…</p>
      ) : (
        <a
          href={authorizeUrl}
          className="inline-block rounded bg-amber-500 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-amber-400"
        >
          Continue with Patreon
        </a>
      )}
      <p className="text-xs text-stone-500">
        Exchange endpoint:{" "}
        <code className="rounded bg-stone-800 px-1">POST /api/v1/auth/patreon/patron/exchange</code>
      </p>
    </main>
  );
}
