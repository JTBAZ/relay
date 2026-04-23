"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { decodePatronOAuthState } from "@/lib/patron-oauth-state";
import { patronPatronOAuthRedirectUri } from "@/lib/patron-patron-redirect-uri";
import { stashPatronConnectCampaignPrompt } from "@/lib/patron-connect-campaign-prompt";
import {
  fetchPatronSessionIfPresent,
  relayFetch,
  RelayApiError
} from "@/lib/relay-api";

/**
 * Patreon authorization codes are **single-use** and short-lived (~10 min). The first POST
 * to `/api/v1/auth/patreon/patron/link` consumes the code at Patreon. Refreshing this page,
 * a React StrictMode double-mount, or the user hitting back/forward all preserve `?code=`
 * in the URL — without an idempotency guard, each remount would re-POST the dead code and
 * Patreon returns 401 ("Patreon token request failed with status 401").
 *
 * `sessionStorage` keyed by the code itself prevents the retry; the user gets a clear
 * "start over" message instead of a confusing upstream error.
 */
const CONSUMED_CODES_STORAGE_KEY = "relay.patreon.patron.consumedCodes.v1";

function readConsumedCodes(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(CONSUMED_CODES_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((s): s is string => typeof s === "string") : []);
  } catch {
    return new Set();
  }
}

function markCodeConsumed(code: string): void {
  if (typeof window === "undefined") return;
  try {
    const set = readConsumedCodes();
    set.add(code);
    // Cap at the last 10 codes — sessionStorage clears on tab close anyway.
    const arr: string[] = [];
    set.forEach((v) => arr.push(v));
    const trimmed = arr.slice(-10);
    window.sessionStorage.setItem(CONSUMED_CODES_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore quota / disabled storage */
  }
}

function isCodeAlreadyConsumed(code: string): boolean {
  return readConsumedCodes().has(code);
}

const ALREADY_USED_MESSAGE =
  "This Patreon link has already been used or expired. Click \u201CPatron connect\u201D to start over.";

/**
 * Patreon's `/oauth2/token` returns 401 for any of: expired code, already-used code, wrong
 * `redirect_uri`, or revoked client credentials. The Relay API surfaces those as a 502
 * `UPSTREAM_AUTH_ERROR` whose message includes the literal "status 401" string from
 * `PatreonClient.requestToken`. Convert that into a user-actionable hint instead of the
 * raw upstream error.
 */
function friendlyMessageForCallbackError(error: unknown): string {
  if (error instanceof RelayApiError) {
    if (
      error.code === "UPSTREAM_AUTH_ERROR" &&
      /status\s*401/i.test(error.message)
    ) {
      return ALREADY_USED_MESSAGE;
    }
    return error.message;
  }
  if (error instanceof Error) {
    if (/Patreon token request failed with status 401/i.test(error.message)) {
      return ALREADY_USED_MESSAGE;
    }
    return error.message;
  }
  return String(error);
}

/** Subset of `POST /api/v1/auth/patreon/patron/link` success `data` (session-first path). */
type PatronLinkSuccessData = {
  token?: string;
  tier_ids?: string[];
  expires_at?: string;
  patreon_user_id?: string;
  /** Every Relay creator linked on this round-trip (paid + declined + former + free follower). */
  linked_relay_creator_ids?: string[];
  /** Currently paying patron of these Relay creators. */
  paid_membership_relay_creator_ids?: string[];
  /** Recent payment failure — pending resolution. */
  declined_patron_relay_creator_ids?: string[];
  /** Cancelled patron — eligible for revival offer UX. */
  former_patron_relay_creator_ids?: string[];
  /** Followed without pledging — primary free-to-paid funnel signal. */
  free_follower_relay_creator_ids?: string[];
  owned_relay_creator_id?: string | null;
  unmapped_patreon_campaign_ids?: string[];
};

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code");
  const state = params.get("state");
  const oauthError = params.get("error");
  const oauthDesc = params.get("error_description");

  const [status, setStatus] = useState<"idle" | "working" | "error" | "needs_signin">("idle");
  const [message, setMessage] = useState<string | null>(null);

  /**
   * Effect-level guard against React StrictMode's intentional double-invocation in dev.
   * `useRef` survives the synthetic remount; `sessionStorage` survives a real page reload.
   * Both are needed.
   */
  const inFlightForCode = useRef<string | null>(null);

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

    if (isCodeAlreadyConsumed(code)) {
      setStatus("error");
      setMessage(ALREADY_USED_MESSAGE);
      return;
    }
    if (inFlightForCode.current === code) {
      // StrictMode remount fired while the first POST is still pending — let it finish.
      return;
    }
    inFlightForCode.current = code;

    let cancelled = false;
    setStatus("working");

    // Validate state (CSRF check — Patreon echoes it back).
    // `decodePatronOAuthState` returns null for nonce-style states (session-first connect page)
    // and a legacy payload for old-format states, or throws on corruption/tampering.
    try {
      decodePatronOAuthState(state);
    } catch (e) {
      setStatus("error");
      setMessage((e as Error).message);
      return;
    }

    const redirectUri = patronPatronOAuthRedirectUri();

    (async () => {
      try {
        const existingSession = await fetchPatronSessionIfPresent();
        if (!existingSession) {
          // PE-A policy: a Patreon login alone may never create a Relay account. Send the user
          // to /login first, preserving the OAuth code in returnTo so they can re-arrive at the
          // callback once signed in. Patreon authorization codes are short-lived (minutes), so
          // worst case the user just reruns /patreon/patron/connect after signing in.
          if (cancelled) return;
          setStatus("needs_signin");
          setMessage(
            "You need a verified Relay account before linking Patreon. Redirecting to sign-in…"
          );
          const here = "/patreon/patron/connect";
          router.replace(`/login?role=supporter&returnTo=${encodeURIComponent(here)}`);
          return;
        }

        // Mark the code as consumed BEFORE the POST. The server forwards the code to Patreon's
        // /oauth2/token endpoint, which is single-use — even if the *response* is a 5xx (e.g.
        // a downstream FK error), Patreon has already invalidated the code, and a refresh-driven
        // retry would 401 against Patreon. The marker ensures we never re-POST a dead code.
        markCodeConsumed(code);

        const linkData = await relayFetch<PatronLinkSuccessData>(
          "/api/v1/auth/patreon/patron/link",
          {
            method: "POST",
            body: JSON.stringify({ code, redirect_uri: redirectUri })
          }
        );
        stashPatronConnectCampaignPrompt({
          owned_relay_creator_id: linkData.owned_relay_creator_id ?? null,
          unmapped_patreon_campaign_ids: linkData.unmapped_patreon_campaign_ids ?? []
        });
        // Intentionally NOT gated on `cancelled`. In React StrictMode (dev) the first mount's
        // cleanup sets `cancelled = true`, while the second mount early-returns on the
        // `inFlightForCode` ref guard without setting up its own state. If we gated the
        // navigation on `cancelled`, the original promise would resolve, see
        // `cancelled === true`, and silently bail -- leaving the page stuck on
        // "Completing Patreon sign-in…" even though the link API succeeded server-side.
        //
        // We use `window.location.assign` rather than `router.replace` for two reasons:
        //   1. It is independent of the React component tree, so it always fires even after
        //      a synthetic StrictMode unmount.
        //   2. A hard navigation is the right semantics here -- the link flow updates Relay
        //      session cookies, role, and notification state. We want every consumer
        //      (PatronTopNav unread badge, role switcher, RelayApp shell) to mount fresh
        //      against the post-link cookie set, not against stale React state.
        if (typeof window !== "undefined") {
          window.location.assign("/patron/feed");
        } else {
          router.replace("/patron/feed");
        }
        return;
      } catch (e) {
        if (!cancelled) {
          const friendly = friendlyMessageForCallbackError(e);
          setStatus("error");
          setMessage(friendly);
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
        <p className="text-stone-300">Completing Patreon sign-in…</p>
      )}
      {status === "needs_signin" && (
        <p className="rounded border border-amber-500/40 bg-amber-950/40 p-3 text-sm text-amber-100">
          {message}
        </p>
      )}
      {status === "error" && (
        <div className="space-y-3">
          <pre className="whitespace-pre-wrap rounded border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
            {message}
          </pre>
          {message === ALREADY_USED_MESSAGE && (
            <Link
              href="/patreon/patron/connect"
              className="inline-block rounded border border-amber-500/50 bg-amber-950/30 px-3 py-1.5 text-sm text-amber-100 hover:border-amber-400 hover:text-amber-50"
            >
              Restart Patreon connect
            </Link>
          )}
        </div>
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
