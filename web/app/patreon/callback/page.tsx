"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RELAY_API_BASE } from "@/lib/relay-api";

function redirectUriForExchange(): string {
  const fromEnv = process.env.NEXT_PUBLIC_PATREON_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  return `${window.location.origin}/patreon/callback`;
}

function CallbackInner() {
  const params = useSearchParams();
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error");
  const oauthDesc = params.get("error_description");

  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
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
      setMessage("Missing code or state. Start from /patreon/connect.");
      return;
    }

    let cancelled = false;
    setStatus("working");

    const redirectUri = redirectUriForExchange();

    (async () => {
      try {
        const res = await fetch(`${RELAY_API_BASE}/api/v1/auth/patreon/exchange`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            creator_id: state,
            code,
            redirect_uri: redirectUri
          })
        });
        const json = (await res.json()) as {
          data?: unknown;
          error?: { message?: string };
        };
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          setMessage(json.error?.message ?? `HTTP ${res.status}`);
          return;
        }
        setStatus("done");
        setMessage(JSON.stringify(json.data, null, 2));
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
      {status === "done" && message && (
        <>
          <p className="text-sm text-emerald-300">Tokens stored (encrypted) on the API server.</p>
          <pre className="overflow-x-auto rounded border border-stone-600 bg-stone-900/80 p-3 text-xs text-stone-200">
            {message}
          </pre>
        </>
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
