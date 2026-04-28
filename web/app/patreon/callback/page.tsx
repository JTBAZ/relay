"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RELAY_CREATOR_ID_STORAGE_KEY,
  hasRelaySignedInCookie,
  isPreparedPatreonOAuthState,
  relayFetch
} from "@/lib/relay-api";
import { getWebAppOrigin } from "@/lib/site-origin";

function redirectUriForExchange(): string {
  const fromEnv = process.env.NEXT_PUBLIC_PATREON_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  const o = getWebAppOrigin();
  return o ? `${o}/patreon/callback` : `${window.location.origin}/patreon/callback`;
}

/** Subset of `POST /api/v1/auth/patreon/exchange` success `data` used by this page. */
type PatreonExchangeWebhook =
  | { status: "ok"; webhook_id: string; uri: string }
  | { status: "failed"; reason: string; detail?: string }
  | { status: "skipped" };

type PatreonExchangeSuccessData = {
  webhook?: PatreonExchangeWebhook;
  campaign_discovery_error?: string;
  patreon_campaign_id?: string;
};

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error");
  const oauthDesc = params.get("error_description");

  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [exchangeData, setExchangeData] = useState<PatreonExchangeSuccessData | null>(null);

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
      setMessage("Missing code or state. Start from /patreon/connect.");
      return;
    }

    let cancelled = false;
    setStatus("working");

    const redirectUri = redirectUriForExchange();

    (async () => {
      try {
        const prepared = isPreparedPatreonOAuthState(state);
        const storedCreatorId =
          window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() ?? "";

        let creatorId: string;
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (prepared) {
          if (!storedCreatorId) {
            throw new Error(
              "Missing relay_creator_id in localStorage — run Create workspace on /patreon/connect first."
            );
          }
          if (!hasRelaySignedInCookie()) {
            throw new Error(
              "Missing Relay session — sign in before OAuth (same browser tab)."
            );
          }
          creatorId = storedCreatorId;
        } else {
          creatorId = state;
        }

        const data = await relayFetch<PatreonExchangeSuccessData>("/api/v1/auth/patreon/exchange", {
          method: "POST",
          headers,
          body: JSON.stringify({
            creator_id: creatorId,
            code,
            redirect_uri: redirectUri,
            ...(prepared ? { state } : {})
          })
        });
        if (cancelled) return;
        setStatus("done");
        setExchangeData(data ?? null);
        const hasWebhookUi =
          data?.webhook != null ||
          (data?.campaign_discovery_error != null && data.campaign_discovery_error.length > 0);
        const delayMs = hasWebhookUi ? 2800 : 1500;
        setTimeout(() => {
          if (!cancelled) router.push("/");
        }, delayMs);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- router stable; effect keyed on OAuth params only
  }, [code, state, oauthError, oauthDesc]);

  return (
    <main className="mx-auto max-w-lg space-y-4 p-8 text-stone-200">
      <p>
        <Link
          href="/patreon/connect"
          className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300"
        >
          ← Connect again
        </Link>
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
        Patreon callback
      </h1>
      {status === "working" && (
        <p className="text-stone-300">Exchanging code with Relay API…</p>
      )}
      {status === "error" && (
        <pre className="whitespace-pre-wrap rounded border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {message}
        </pre>
      )}
      {status === "done" && (
        <div className="space-y-3 text-sm">
          <p className="text-emerald-300">Patreon connected. Redirecting to your dashboard…</p>
          {exchangeData?.campaign_discovery_error != null &&
            exchangeData.campaign_discovery_error.length > 0 && (
              <div
                className="rounded-md border border-amber-500/45 bg-amber-950/40 px-3 py-2 text-amber-100"
                role="status"
              >
                <p className="font-medium text-amber-200">Campaign discovery</p>
                <p className="mt-1 text-amber-100/95">{exchangeData.campaign_discovery_error}</p>
                <p className="mt-2 text-xs text-amber-200/80">
                  You can finish webhook setup from your Library — open the{" "}
                  <strong className="font-semibold">Patreon</strong> menu after redirect.
                </p>
              </div>
            )}
          {exchangeData?.webhook != null && (
            <div className="space-y-2">
              {exchangeData.webhook.status === "ok" && (
                <p className="rounded-md border border-emerald-500/40 bg-emerald-950/35 px-3 py-2 text-emerald-100">
                  Patreon webhooks registered — new posts will trigger live scrapes.
                </p>
              )}
              {exchangeData.webhook.status === "failed" && (
                <div
                  className="rounded-md border border-amber-500/45 bg-amber-950/40 px-3 py-2 text-amber-100"
                  role="alert"
                >
                  <p className="font-medium text-amber-200">Webhook registration did not complete</p>
                  <p className="mt-1 font-mono text-xs text-amber-100/90">
                    {exchangeData.webhook.reason}
                    {exchangeData.webhook.detail != null && exchangeData.webhook.detail.length > 0
                      ? `: ${exchangeData.webhook.detail}`
                      : ""}
                  </p>
                  <p className="mt-2 text-xs text-amber-200/85">
                    After redirect, open your Library and use the{" "}
                    <strong className="font-semibold">Patreon</strong> menu →{" "}
                    <strong className="font-semibold">Register webhooks</strong> to retry.
                  </p>
                </div>
              )}
              {exchangeData.webhook.status === "skipped" && (
                <p className="rounded-md border border-stone-600/50 bg-stone-900/50 px-3 py-2 text-stone-300">
                  Webhook registration was skipped (for example, no public webhook URL or campaign not
                  resolved). You can retry from the Patreon menu in your Library after redirect.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default function PatreonCallbackPage() {
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
