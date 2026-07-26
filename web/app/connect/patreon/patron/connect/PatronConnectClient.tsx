"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MailCheck, Plug, ShieldAlert } from "lucide-react";
import { PATREON_PATRON_OAUTH_SCOPES } from "@/lib/patreon-patron-scopes";
import { patronPatronOAuthRedirectUri } from "@/lib/patron-patron-redirect-uri";
import { encodePatronOAuthNonce } from "@/lib/patron-oauth-state";
import { fetchPatronSessionIfPresent } from "@/lib/relay-api";
import {
  PatronFlowCard,
  PatronFlowLoading,
  PatronFlowNotice,
  PatronFlowPrimaryButton,
  PatronFlowSecondaryLink,
  PatronFlowShell,
  patronFlowColors
} from "@/components/patron/patron-flow-ui";

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
          router.replace(
            `/login?role=supporter&returnTo=${encodeURIComponent("/connect/patreon/patron/connect")}`
          );
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
    return () => {
      cancelled = true;
    };
  }, [router]);

  const clientId = initialClientId;
  const redirectUri = patronPatronOAuthRedirectUri();
  const showDevRedirect =
    process.env.NODE_ENV === "development" && Boolean(redirectUri?.trim());

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
    <PatronFlowShell
      title="Connect your Patreon"
      subtitle="Authorize Relay to read your memberships and tier access — no extra subscription required."
      backHref="/feed"
      backLabel="Supporter home"
    >
      {sessionGate === "checking" ? (
        <PatronFlowLoading label="Checking your Relay session…" />
      ) : sessionGate === "needs_signin" ? (
        <PatronFlowCard
          icon={<ShieldAlert size={18} aria-hidden />}
          iconColor={patronFlowColors.warn}
          title="Sign in first"
          body={
            <p>
              You need a Relay supporter account before linking Patreon. Redirecting to sign-in…
            </p>
          }
        >
          <PatronFlowPrimaryButton
            href={`/login?role=supporter&returnTo=${encodeURIComponent("/connect/patreon/patron/connect")}`}
          >
            Sign in to continue
          </PatronFlowPrimaryButton>
        </PatronFlowCard>
      ) : sessionGate === "needs_verify_email" ? (
        <PatronFlowCard
          icon={<MailCheck size={18} aria-hidden />}
          iconColor={patronFlowColors.warn}
          title="Verify your email"
          body={
            <>
              <p>
                Confirm your inbox before Patreon linking — same rule as the supporter feed. Check
                your email for the confirmation link, then return here.
              </p>
              <p className="mt-2 text-xs" style={{ color: patronFlowColors.subtle }}>
                After confirming, refresh this page or sign out and back in if this message stays.
              </p>
            </>
          }
        >
          <PatronFlowPrimaryButton href="/connect/patreon/patron/connect">
            I verified — refresh
          </PatronFlowPrimaryButton>
          <PatronFlowSecondaryLink href="/login?role=supporter">
            Sign in with a different account
          </PatronFlowSecondaryLink>
        </PatronFlowCard>
      ) : !clientId.trim() ? (
        <PatronFlowNotice tone="warn">
          Set{" "}
          <code className="rounded px-1" style={{ background: patronFlowColors.pageBg }}>
            PATREON_CLIENT_ID
          </code>{" "}
          in{" "}
          <code className="rounded px-1" style={{ background: patronFlowColors.pageBg }}>
            web/.env.local
          </code>{" "}
          to enable Patreon connect.
        </PatronFlowNotice>
      ) : !redirectUri ? (
        <PatronFlowLoading label="Preparing Patreon link…" />
      ) : (
        <PatronFlowCard
          icon={<Plug size={18} aria-hidden />}
          iconColor={patronFlowColors.accentHover}
          title="Link your memberships"
          body={
            <p>
              Relay syncs the creators you support and your current tier access so your feed shows
              the right posts.
            </p>
          }
        >
          <PatronFlowPrimaryButton href={authorizeUrl}>Continue with Patreon</PatronFlowPrimaryButton>
          <PatronFlowSecondaryLink href="/feed">
            Skip for now (limited preview)
          </PatronFlowSecondaryLink>
        </PatronFlowCard>
      )}

      {showDevRedirect ? (
        <p className="text-center text-[10px] leading-snug" style={{ color: patronFlowColors.subtle }}>
          Dev redirect:{" "}
          <code className="break-all rounded px-1" style={{ background: patronFlowColors.cardBg }}>
            {redirectUri}
          </code>
        </p>
      ) : null}
    </PatronFlowShell>
  );
}

export function PatronConnectClient({ initialClientId }: { initialClientId: string }) {
  return (
    <Suspense fallback={<PatronFlowShell title="Connect your Patreon"><PatronFlowLoading /></PatronFlowShell>}>
      <PatronConnectInner initialClientId={initialClientId} />
    </Suspense>
  );
}
