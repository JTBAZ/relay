"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { decodePatronOAuthState } from "@/lib/patron-oauth-state";
import { patronPatronOAuthRedirectUri } from "@/lib/patron-patron-redirect-uri";
import { stashPatronConnectCampaignPrompt } from "@/lib/patron-connect-campaign-prompt";
import {
  fetchPatronSessionIfPresent,
  relayFetch,
  RelayApiError
} from "@/lib/relay-api";
import {
  PatronFlowCard,
  PatronFlowNotice,
  PatronFlowPrimaryButton,
  PatronFlowShell,
  patronFlowColors
} from "@/components/patron/patron-flow-ui";

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
  "This Patreon link has already been used or expired. Start connect again from the button below.";

function friendlyMessageForCallbackError(error: unknown): string {
  if (error instanceof RelayApiError) {
    if (error.code === "UPSTREAM_AUTH_ERROR" && /status\s*401/i.test(error.message)) {
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

type PatronLinkSuccessData = {
  token?: string;
  tier_ids?: string[];
  expires_at?: string;
  patreon_user_id?: string;
  linked_relay_creator_ids?: string[];
  paid_membership_relay_creator_ids?: string[];
  declined_patron_relay_creator_ids?: string[];
  former_patron_relay_creator_ids?: string[];
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
  const inFlightForCode = useRef<string | null>(null);

  useEffect(() => {
    if (oauthError) {
      setStatus("error");
      setMessage(`${oauthError}${oauthDesc ? `: ${decodeURIComponent(oauthDesc)}` : ""}`);
      return;
    }
    if (!code || !state) {
      setStatus("error");
      setMessage("Missing authorization details. Start from the Patreon connect page.");
      return;
    }

    if (isCodeAlreadyConsumed(code)) {
      setStatus("error");
      setMessage(ALREADY_USED_MESSAGE);
      return;
    }
    if (inFlightForCode.current === code) {
      return;
    }
    inFlightForCode.current = code;

    let cancelled = false;
    setStatus("working");

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
          if (cancelled) return;
          setStatus("needs_signin");
          setMessage(
            "You need a verified Relay account before linking Patreon. Redirecting to sign-in…"
          );
          router.replace(
            `/login?role=supporter&returnTo=${encodeURIComponent("/connect/patreon/patron/connect")}`
          );
          return;
        }

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
        if (typeof window !== "undefined") {
          window.location.assign("/feed");
        } else {
          router.replace("/feed");
        }
        return;
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setMessage(friendlyMessageForCallbackError(e));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, state, oauthError, oauthDesc, router]);

  return (
    <PatronFlowShell
      title="Linking Patreon"
      subtitle="Hang tight — we're syncing your memberships with Relay."
      backHref="/connect/patreon/patron/connect"
      backLabel="Patron connect"
      footer={null}
    >
      {status === "working" ? (
        <PatronFlowCard
          icon={<Loader2 size={18} className="animate-spin" aria-hidden />}
          iconColor={patronFlowColors.accentHover}
          title="Completing Patreon sign-in"
          body={<p>This usually takes a few seconds.</p>}
        />
      ) : null}

      {status === "needs_signin" ? (
        <PatronFlowNotice tone="warn">{message}</PatronFlowNotice>
      ) : null}

      {status === "error" ? (
        <PatronFlowCard
          icon={<ShieldAlert size={18} aria-hidden />}
          iconColor={patronFlowColors.error}
          title="Couldn't finish linking"
          body={
            <p className="whitespace-pre-wrap break-words">{message ?? "Something went wrong."}</p>
          }
        >
          <PatronFlowPrimaryButton href="/connect/patreon/patron/connect">
            {message === ALREADY_USED_MESSAGE ? "Restart Patreon connect" : "Try again"}
          </PatronFlowPrimaryButton>
          <Link
            href="/feed"
            className="block text-center text-xs underline-offset-2 hover:underline"
            style={{ color: patronFlowColors.muted }}
          >
            Back to feed
          </Link>
        </PatronFlowCard>
      ) : null}
    </PatronFlowShell>
  );
}

export default function PatreonPatronCallbackPage() {
  return (
    <Suspense
      fallback={
        <PatronFlowShell title="Linking Patreon">
          <PatronFlowCard
            icon={<Loader2 size={18} className="animate-spin" aria-hidden />}
            title="Loading…"
          />
        </PatronFlowShell>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
