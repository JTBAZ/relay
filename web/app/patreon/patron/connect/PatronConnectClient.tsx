"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PATREON_PATRON_OAUTH_SCOPES } from "@/lib/patreon-patron-scopes";
import { patronPatronOAuthRedirectUri } from "@/lib/patron-patron-redirect-uri";
import { encodePatronOAuthNonce } from "@/lib/patron-oauth-state";
import { fetchPatronSessionIfPresent } from "@/lib/relay-api";

/** PE-A: session required; Supabase patrons must have confirmed email before OAuth (matches POST /link gate). */
type SessionGateState =
  | "checking"
  | "needs_signin"
  | "needs_verify_email"
  | "ready";

function PatronConnectInner({ initialClientId }: { initialClientId: string }) {
  const router = useRouter();

  const [sessionGate, setSessionGate] = useState<SessionGateState>("checking");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchPatronSessionIfPresent();
        if (cancelled) return;
        if (!me) {
          setSessionGate("needs_signin");
          router.replace("/login?role=supporter&returnTo=%2Fpatreon%2Fpatron%2Fconnect");
          return;
        }
        if (me.email_verified === false) {
          setSessionGate("needs_verify_email");
          return;
        }
        setSessionGate("ready");
      } catch {
        if (!cancelled) setSessionGate("needs_signin");
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const clientId = initialClientId;
  const redirectUri = patronPatronOAuthRedirectUri();

  // Nonce-based state: no creator_id or campaign_numeric_id needed for the session-first /link path.
  // The API pulls all memberships from Patreon's identity API using the campaigns scope.
  const authorizeUrl = useMemo(() => {
    if (!clientId.trim() || !redirectUri) return "";
    const u = new URL("https://www.patreon.com/oauth2/authorize");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", clientId.trim());
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("scope", PATREON_PATRON_OAUTH_SCOPES);
    u.searchParams.set("state", encodePatronOAuthNonce());
    return u.toString();
  }, [clientId, redirectUri]);

  return (
    <main className="mx-auto max-w-lg space-y-6 p-8 text-stone-200">
      <p>
        <Link href="/" className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300">
          ← Gallery
        </Link>
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
        Connect your Patreon
      </h1>
      <p className="text-sm text-stone-300">
        Authorize Relay to read your Patreon memberships. Relay syncs the creators you support
        and your tier access — no extra subscription required.
      </p>
      <p className="text-xs text-stone-500">
        Supporters with a Supabase sign-in must verify their email before Patreon connect (onboarding
        and this page).
      </p>

      {sessionGate === "checking" ? (
        <p className="text-sm text-stone-400">Checking your Relay session…</p>
      ) : sessionGate === "needs_signin" ? (
        <p className="rounded border border-amber-600/50 bg-amber-950/40 p-3 text-sm text-amber-100">
          You need a Relay account before linking Patreon. Redirecting to{" "}
          <Link
            href="/login?role=supporter&returnTo=%2Fpatreon%2Fpatron%2Fconnect"
            className="underline decoration-amber-300/70 hover:text-amber-50"
          >
            sign-in
          </Link>
          …
        </p>
      ) : sessionGate === "needs_verify_email" ? (
        <div
          className="space-y-3 rounded border border-amber-700/50 bg-amber-950/40 p-4 text-sm text-amber-100"
          role="status"
        >
          <p>
            <span className="font-semibold text-amber-50">Confirm your email first.</span> Relay
            won&apos;t start Patreon linking until your inbox is verified — same rule as the
            supporter feed. Check your email for the confirmation link, then return here.
          </p>
          <p className="text-xs text-amber-200/85">
            After confirming, refresh this page or sign out and back in if this message stays.
          </p>
        </div>
      ) : !clientId.trim() ? (
        <p className="rounded border border-amber-600/50 bg-amber-950/40 p-3 text-sm text-amber-100">
          Set <code className="rounded bg-stone-900 px-1">PATREON_CLIENT_ID</code> in{" "}
          <code className="rounded bg-stone-900 px-1">web/.env.local</code>.
        </p>
      ) : !redirectUri ? (
        <p className="text-sm text-stone-400">Preparing link…</p>
      ) : (
        <a
          href={authorizeUrl}
          className="inline-flex w-full items-center justify-center rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-stone-950 hover:bg-amber-400 transition-colors"
        >
          Continue with Patreon
        </a>
      )}

      <p className="text-xs text-stone-500">
        Redirect URI:{" "}
        {redirectUri ? (
          <code className="break-all rounded bg-stone-800 px-1 text-amber-200">{redirectUri}</code>
        ) : (
          <span className="text-amber-300">…</span>
        )}
      </p>
    </main>
  );
}

export function PatronConnectClient({ initialClientId }: { initialClientId: string }) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg p-8 text-stone-400">
          <p className="text-sm">Loading…</p>
        </main>
      }
    >
      <PatronConnectInner initialClientId={initialClientId} />
    </Suspense>
  );
}
