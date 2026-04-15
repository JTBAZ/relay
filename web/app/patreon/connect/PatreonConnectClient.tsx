"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PATREON_CREATOR_OAUTH_SCOPES } from "@/lib/patreon-creator-scopes";
import {
  RELAY_CREATOR_ID_STORAGE_KEY,
  RELAY_PUBLIC_SLUG_STORAGE_KEY,
  RelayApiError,
  buildPatreonCreatorAuthorizeUrl,
  postCreatorWorkspace,
  postPatreonCreatorPrepare
} from "@/lib/relay-api";

type Props = {
  /** From Server Component: {@link resolvePatreonOAuthClientId} */
  initialClientId: string;
};

/**
 * Creator Patreon OAuth: production flow uses `prepare` + signed `state` (MT-035).
 * Set `NEXT_PUBLIC_RELAY_PATREON_LEGACY_CONNECT=1` for the old manual creator_id-as-state dev UX.
 */
export default function PatreonConnectClient({ initialClientId }: Props) {
  const legacyConnect = process.env.NEXT_PUBLIC_RELAY_PATREON_LEGACY_CONNECT === "1";
  const [origin, setOrigin] = useState("");
  const [creatorIdManual, setCreatorIdManual] = useState("dev_creator");
  const [storedCreatorId, setStoredCreatorId] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [busy, setBusy] = useState<"idle" | "workspace" | "prepare">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    const t = window.localStorage.getItem("relay_session_token")?.trim();
    setHasSession(Boolean(t));
    setStoredCreatorId(window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() ?? "");
  }, []);

  const clientId = initialClientId;
  const redirectUri = useMemo(() => {
    const envRedirect = process.env.NEXT_PUBLIC_PATREON_REDIRECT_URI?.trim();
    return envRedirect || (origin ? `${origin}/patreon/callback` : "");
  }, [origin]);

  const authorizeUrlLegacy = useMemo(() => {
    if (!clientId.trim() || !redirectUri || !legacyConnect) return "";
    const u = new URL("https://www.patreon.com/oauth2/authorize");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", clientId.trim());
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("scope", PATREON_CREATOR_OAUTH_SCOPES);
    u.searchParams.set("state", creatorIdManual.trim() || "dev_creator");
    return u.toString();
  }, [clientId, redirectUri, creatorIdManual, legacyConnect]);

  const runEnsureWorkspace = useCallback(async () => {
    setError(null);
    setBusy("workspace");
    try {
      const d = await postCreatorWorkspace();
      window.localStorage.setItem(RELAY_CREATOR_ID_STORAGE_KEY, d.relay_creator_id);
      const slug = d.public_slug?.trim();
      if (slug) {
        window.localStorage.setItem(RELAY_PUBLIC_SLUG_STORAGE_KEY, slug);
      }
      setStoredCreatorId(d.relay_creator_id);
    } catch (e) {
      const msg =
        e instanceof RelayApiError ? e.message : e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy("idle");
    }
  }, []);

  const runPrepareAndGo = useCallback(async () => {
    setError(null);
    const cid = storedCreatorId.trim();
    if (!cid) {
      setError("Create a workspace first (button below), or enable legacy connect.");
      return;
    }
    if (!hasSession) {
      setError("Sign in and save a Relay session token (e.g. Auth hub or relay-session) first.");
      return;
    }
    if (!clientId.trim() || !redirectUri) {
      setError("Missing client id or redirect URI.");
      return;
    }
    setBusy("prepare");
    try {
      const prep = await postPatreonCreatorPrepare(cid);
      window.location.href = buildPatreonCreatorAuthorizeUrl(clientId, redirectUri, prep.state);
    } catch (e) {
      const msg =
        e instanceof RelayApiError ? e.message : e instanceof Error ? e.message : String(e);
      setError(msg);
      setBusy("idle");
    }
  }, [clientId, redirectUri, hasSession, storedCreatorId]);

  return (
    <main className="mx-auto max-w-lg space-y-6 p-8 text-stone-200">
      <p>
        <Link href="/" className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300">
          ← Gallery
        </Link>
        {" · "}
        <Link href="/patreon/cookie" className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300">
          Session Cookie
        </Link>
        {" · "}
        <Link
          href="/patreon/patron/connect"
          className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300"
        >
          Patron login
        </Link>
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
        Connect Patreon{legacyConnect ? " (legacy dev)" : ""}
      </h1>
      <p className="text-sm text-stone-300">
        Uses scopes{" "}
        <code className="rounded bg-stone-800 px-1 text-stone-200">{PATREON_CREATOR_OAUTH_SCOPES}</code>
        — includes <code className="rounded bg-stone-800 px-1">campaigns.members</code> so member sync
        and emails work with the same creator token.
      </p>
      <p className="text-sm text-stone-300">
        The <strong className="text-stone-100">Client ID</strong> here is public (same as in
        Patreon’s portal). Your <strong className="text-stone-100">Client Secret</strong> stays
        only in the Relay API <code className="rounded bg-stone-800 px-1 py-0.5 text-stone-200">.env</code>{" "}
        — never in Next.js{" "}
        <code className="rounded bg-stone-800 px-1 py-0.5 text-stone-200">NEXT_PUBLIC_*</code>.
      </p>

      {!legacyConnect && (
        <div className="space-y-3 rounded border border-stone-600/80 bg-stone-900/40 p-4 text-sm">
          <p className="font-medium text-stone-100">Recommended flow (prepare + signed state)</p>
          <ul className="list-inside list-disc space-y-1 text-stone-400">
            <li>
              Relay session in <code className="rounded bg-stone-800 px-1">localStorage.relay_session_token</code>{" "}
              ({hasSession ? "present" : "missing — sign in via Auth hub or Supabase relay-session"})
            </li>
            <li>
              Studio id:{" "}
              <code className="rounded bg-stone-800 px-1">
                {storedCreatorId || "(not set)"}
              </code>
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== "idle"}
              onClick={() => void runEnsureWorkspace()}
              className="rounded bg-stone-700 px-3 py-1.5 text-xs font-medium text-stone-100 hover:bg-stone-600 disabled:opacity-50"
            >
              {busy === "workspace" ? "Creating…" : "Create / refresh workspace"}
            </button>
            <button
              type="button"
              disabled={busy !== "idle"}
              onClick={() => void runPrepareAndGo()}
              className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-stone-950 hover:bg-amber-400 disabled:opacity-50"
            >
              {busy === "prepare" ? "Preparing…" : "Continue to Patreon"}
            </button>
          </div>
          <p className="text-xs text-stone-500">
            “Continue” calls <code className="rounded bg-stone-800 px-1">/auth/patreon/creator/prepare</code> then
            redirects to Patreon with server-signed <code className="rounded bg-stone-800 px-1">state</code>.
          </p>
        </div>
      )}

      {legacyConnect && (
        <label className="block space-y-1">
          <span className="text-sm font-medium text-stone-200">Relay creator_id (legacy)</span>
          <input
            className="w-full rounded border border-stone-600 bg-stone-100 px-3 py-2 text-stone-900 placeholder:text-stone-500"
            value={creatorIdManual}
            onChange={(e) => setCreatorIdManual(e.target.value)}
            placeholder="dev_creator"
          />
          <span className="text-xs text-stone-400">
            Passed as OAuth <code className="rounded bg-stone-800 px-1 text-stone-200">state</code> — dev only.
            Turn off <code className="rounded bg-stone-800 px-1">NEXT_PUBLIC_RELAY_PATREON_LEGACY_CONNECT</code> in
            production.
          </span>
        </label>
      )}

      {error && (
        <pre className="whitespace-pre-wrap rounded border border-red-500/40 bg-red-950/50 p-3 text-xs text-red-200">
          {error}
        </pre>
      )}

      <p className="text-xs text-stone-400">
        Redirect URI sent to Patreon:{" "}
        {redirectUri ? (
          <code className="break-all rounded bg-stone-800 px-1.5 py-0.5 text-amber-200">{redirectUri}</code>
        ) : (
          <span className="text-amber-300">detecting from your browser…</span>
        )}
        <br />
        Must match a URI in your Patreon app settings exactly.
      </p>
      {!clientId.trim() ? (
        <p className="rounded border border-amber-600/50 bg-amber-950/40 p-3 text-sm text-amber-100">
          Set <code className="rounded bg-stone-900 px-1">PATREON_CLIENT_ID</code> (runtime) or{" "}
          <code className="rounded bg-stone-900 px-1">NEXT_PUBLIC_PATREON_CLIENT_ID</code> in{" "}
          <code className="rounded bg-stone-900 px-1">web/.env.local</code>, or runtime env on the host
          (see <code className="rounded bg-stone-900 px-1">web/.env.example</code>). Production: prefer{" "}
          <code className="rounded bg-stone-900 px-1">PATREON_CLIENT_ID</code> so a rebuild is not required.
        </p>
      ) : legacyConnect && !redirectUri ? (
        <p className="text-sm text-stone-400">Preparing OAuth link…</p>
      ) : legacyConnect && authorizeUrlLegacy ? (
        <a
          href={authorizeUrlLegacy}
          className="inline-block rounded bg-amber-500 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-amber-400"
        >
          Continue to Patreon (legacy)
        </a>
      ) : null}
    </main>
  );
}
