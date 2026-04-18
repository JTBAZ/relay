"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { decodePatronOAuthState } from "@/lib/patron-oauth-state";
import { patronPatronOAuthRedirectUri } from "@/lib/patron-patron-redirect-uri";
import { relayFetch } from "@/lib/relay-api";

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error");
  const oauthDesc = params.get("error_description");

  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (oauthError) {
      setStatus("error");
      setMessage(
        `${oauthError}${oauthDesc ? `: ${decodeURIComponent(oauthDesc)}` : ""}`
      );
      return;
    }
    if (!code || !state) {
      setStatus("error");
      setMessage("Missing code or state. Start from /patreon/patron/connect.");
      return;
    }

    let cancelled = false;
    setStatus("working");

    let payload: ReturnType<typeof decodePatronOAuthState>;
    try {
      payload = decodePatronOAuthState(state);
    } catch (e) {
      setStatus("error");
      setMessage((e as Error).message);
      return;
    }

    const redirectUri = patronPatronOAuthRedirectUri();

    (async () => {
      try {
        await relayFetch<{
          token?: string;
          tier_ids?: string[];
          expires_at?: string;
          patreon_user_id?: string;
        }>("/api/v1/auth/patreon/patron/exchange", {
          method: "POST",
          body: JSON.stringify({
            creator_id: payload.creator_id,
            patreon_campaign_numeric_id: payload.patreon_campaign_numeric_id,
            code,
            redirect_uri: redirectUri
          })
        });
        if (cancelled) return;
        router.replace("/patron/feed");
        return;
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setMessage((e as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, state, oauthError, oauthDesc, router]);

  return (
    <main className="mx-auto max-w-lg space-y-4 p-8 text-stone-200">
      <p>
        <Link
          href="/patreon/patron/connect"
          className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300"
        >
          ← Patron connect
        </Link>
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
        Patreon patron callback
      </h1>
      {status === "working" && (
        <p className="text-stone-300">Exchanging code and syncing tiers…</p>
      )}
      {status === "error" && (
        <pre className="whitespace-pre-wrap rounded border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {message}
        </pre>
      )}
    </main>
  );
}

export default function PatreonPatronCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="p-8 text-stone-300">
          <p>Loading…</p>
        </main>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
