"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RELAY_CREATOR_ID_STORAGE_KEY,
  hasRelaySignedInCookie,
  isPreparedSubscribeStarOAuthState,
  postSubscribeStarCreatorExchange
} from "@/lib/relay-api";
import { getWebAppOrigin } from "@/lib/site-origin";

function redirectUriForExchange(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  const o = getWebAppOrigin();
  return o
    ? `${o}/subscribestar/creator/callback`
    : `${window.location.origin}/subscribestar/creator/callback`;
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
  const [profileId, setProfileId] = useState<string | null>(null);

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
      setMessage("Missing code or state. Start from /subscribestar/creator/connect.");
      return;
    }

    let cancelled = false;
    setStatus("working");

    (async () => {
      try {
        const prepared = isPreparedSubscribeStarOAuthState(state);
        const storedCreatorId =
          window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() ?? "";

        let creatorId: string;
        if (prepared) {
          if (!storedCreatorId) {
            throw new Error(
              "Missing relay_creator_id in localStorage — run Create workspace on /subscribestar/creator/connect first."
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

        const data = await postSubscribeStarCreatorExchange({
          creator_id: creatorId,
          code,
          redirect_uri: redirectUriForExchange(),
          ...(prepared ? { state } : {})
        });
        if (cancelled) return;
        setStatus("done");
        setProfileId(data?.subscribestar_profile_id ?? null);
        setTimeout(() => {
          if (!cancelled) router.push("/");
        }, 1800);
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
          href="/subscribestar/creator/connect"
          className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300"
        >
          ← Connect again
        </Link>
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
        SubscribeStar callback
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
        <div className="space-y-2 text-sm">
          <p className="text-emerald-300">SubscribeStar connected. Redirecting…</p>
          {profileId != null && profileId.length > 0 ? (
            <p className="text-stone-400">
              Profile id:{" "}
              <code className="rounded bg-stone-800 px-1 text-amber-200">{profileId}</code>
            </p>
          ) : null}
        </div>
      )}
    </main>
  );
}

export default function SubscribeStarCreatorCallbackPage() {
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
