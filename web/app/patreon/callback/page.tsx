"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RELAY_API_BASE,
  RELAY_CREATOR_ID_STORAGE_KEY,
  isPreparedPatreonOAuthState
} from "@/lib/relay-api";

function redirectUriForExchange(): string {
  const fromEnv = process.env.NEXT_PUBLIC_PATREON_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  return `${window.location.origin}/patreon/callback`;
}

function CallbackInner() {
  const router = useRouter();
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
        const prepared = isPreparedPatreonOAuthState(state);
        const token = window.localStorage.getItem("relay_session_token")?.trim() ?? "";
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
          if (!token) {
            throw new Error(
              "Missing relay_session_token — sign in before OAuth (same browser tab)."
            );
          }
          creatorId = storedCreatorId;
          headers.authorization = `Bearer ${token}`;
        } else {
          creatorId = state;
        }

        const res = await fetch(`${RELAY_API_BASE}/api/v1/auth/patreon/exchange`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            creator_id: creatorId,
            code,
            redirect_uri: redirectUri,
            ...(prepared ? { state } : {})
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
        // Patreon connected — redirect to creator dashboard
        setTimeout(() => { if (!cancelled) router.push("/"); }, 1500);
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
      {status === "done" && (
        <p className="text-sm text-emerald-300">
          Patreon connected. Redirecting to your dashboard…
        </p>
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
