"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SUBSCRIBESTAR_CREATOR_OAUTH_SCOPES } from "@/lib/subscribestar-creator-scopes";
import {
  RELAY_CREATOR_ID_STORAGE_KEY,
  RELAY_PUBLIC_SLUG_STORAGE_KEY,
  RelayApiError,
  buildSubscribeStarCreatorAuthorizeUrl,
  hasRelaySignedInCookie,
  postCreatorWorkspace,
  postSubscribeStarCreatorPrepare,
  postSubscribeStarCreatorSyncPosts,
} from "@/lib/relay-api";
import { getWebAppOrigin } from "@/lib/site-origin";

type Props = {
  initialClientId: string;
};

export default function SubscribeStarCreatorConnectClient({ initialClientId }: Props) {
  const legacyConnect =
    process.env.NEXT_PUBLIC_RELAY_SUBSCRIBESTAR_LEGACY_CONNECT === "1";
  const [origin, setOrigin] = useState("");
  const [creatorIdManual, setCreatorIdManual] = useState("dev_creator");
  const [storedCreatorId, setStoredCreatorId] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [busy, setBusy] = useState<"idle" | "workspace" | "prepare" | "sync">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(getWebAppOrigin());
    setHasSession(hasRelaySignedInCookie());
    setStoredCreatorId(window.localStorage.getItem(RELAY_CREATOR_ID_STORAGE_KEY)?.trim() ?? "");
  }, []);

  const clientId = initialClientId;
  const redirectUri = useMemo(() => {
    const envRedirect = process.env.NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_REDIRECT_URI?.trim();
    return envRedirect || (origin ? `${origin}/subscribestar/creator/callback` : "");
  }, [origin]);

  const authorizeUrlLegacy = useMemo(() => {
    if (!clientId.trim() || !redirectUri || !legacyConnect) return "";
    return buildSubscribeStarCreatorAuthorizeUrl(
      clientId,
      redirectUri,
      creatorIdManual.trim() || "dev_creator"
    );
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
      setError("Sign in so the Relay session cookie is set (e.g. Auth hub or relay-session) first.");
      return;
    }
    if (!clientId.trim() || !redirectUri) {
      setError("Missing client id or redirect URI.");
      return;
    }
    setBusy("prepare");
    try {
      const prep = await postSubscribeStarCreatorPrepare(cid);
      window.location.href = buildSubscribeStarCreatorAuthorizeUrl(
        clientId,
        redirectUri,
        prep.state
      );
    } catch (e) {
      const msg =
        e instanceof RelayApiError ? e.message : e instanceof Error ? e.message : String(e);
      setError(msg);
      setBusy("idle");
    }
  }, [clientId, redirectUri, hasSession, storedCreatorId]);

  const runPullPosts = useCallback(async () => {
    setError(null);
    const cid = storedCreatorId.trim();
    if (!cid) {
      setError("Create a workspace first (button below).");
      return;
    }
    if (!hasSession) {
      setError("Sign in so the Relay session cookie is set first.");
      return;
    }
    setBusy("sync");
    try {
      await postSubscribeStarCreatorSyncPosts({ creator_id: cid });
      setBusy("idle");
    } catch (e) {
      const msg =
        e instanceof RelayApiError ? e.message : e instanceof Error ? e.message : String(e);
      setError(msg);
      setBusy("idle");
    }
  }, [hasSession, storedCreatorId]);

  return (
    <main className="mx-auto max-w-lg space-y-6 p-8 text-stone-200">
      <p>
        <Link href="/" className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300">
          ← Gallery
        </Link>
        {" · "}
        <Link
          href="/patreon/connect"
          className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300"
        >
          Patreon connect
        </Link>
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
        Connect SubscribeStar{legacyConnect ? " (legacy dev)" : ""}
      </h1>
      <p className="text-sm text-stone-300">
        Default scopes:{" "}
        <code className="rounded bg-stone-800 px-1 text-stone-200">
          {SUBSCRIBESTAR_CREATOR_OAUTH_SCOPES}
        </code>{" "}
        — adjust via{" "}
        <code className="rounded bg-stone-800 px-1">NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_SCOPE</code>{" "}
        after API Explorer confirms your app registration.
      </p>
      <p className="text-sm text-amber-200/95">
        Ingest stays behind <code className="rounded bg-stone-900 px-1">SUBSCRIBESTAR_INGEST_ENABLED</code>{" "}
        on the Relay API until product clears SubscribeStar API terms.
      </p>

      {!legacyConnect && (
        <div className="space-y-3 rounded border border-stone-600/80 bg-stone-900/40 p-4 text-sm">
          <p className="font-medium text-stone-100">Recommended flow (prepare + signed state)</p>
          <ul className="list-inside list-disc space-y-1 text-stone-400">
            <li>
              Relay session ({hasSession ? "present" : "missing — sign in first"})
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
              {busy === "prepare" ? "Preparing…" : "Continue to SubscribeStar"}
            </button>
            <button
              type="button"
              disabled={busy !== "idle"}
              onClick={() => void runPullPosts()}
              className="rounded border border-stone-500/70 bg-stone-800 px-3 py-1.5 text-xs font-medium text-stone-100 hover:bg-stone-700 disabled:opacity-50"
            >
              {busy === "sync" ? "Pulling posts…" : "Pull posts from SubscribeStar"}
            </button>
          </div>
          <p className="text-xs text-stone-500">
            Uses <code className="rounded bg-stone-800 px-1">POST /auth/subscribestar/creator/prepare</code>{" "}
            then redirects with signed <code className="rounded bg-stone-800 px-1">state</code> when{" "}
            <code className="rounded bg-stone-800 px-1">RELAY_ENFORCE_CREATOR_OAUTH_BIND=1</code>.
          </p>
          <p className="text-xs text-stone-500">
            <span className="font-medium text-stone-400">Pull posts</span> calls{" "}
            <code className="rounded bg-stone-800 px-1">
              POST /api/v1/subscribestar/creator/sync/posts
            </code>
            {" "}
            when ingest is enabled on the Relay API. Scheduled pulls use BullMQ repeat or an in-process timer
            with{" "}
            <code className="rounded bg-stone-800 px-1">RELAY_SUBSCRIBESTAR_GRAPHQL_INGEST_MS</code>.
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
            Passed as OAuth <code className="rounded bg-stone-800 px-1 text-stone-200">state</code>. Dev only.
          </span>
        </label>
      )}

      {error && (
        <pre className="whitespace-pre-wrap rounded border border-red-500/40 bg-red-950/50 p-3 text-xs text-red-200">
          {error}
        </pre>
      )}

      <p className="text-xs text-stone-400">
        Redirect URI:{" "}
        {redirectUri ? (
          <code className="break-all rounded bg-stone-800 px-1.5 py-0.5 text-amber-200">
            {redirectUri}
          </code>
        ) : (
          <span className="text-amber-300">detecting…</span>
        )}
        <br />
        Must match SubscribeStar OAuth app settings exactly (
        <code className="rounded bg-stone-800 px-1">NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_REDIRECT_URI</code> optional).
      </p>
      {!clientId.trim() ? (
        <p className="rounded border border-amber-600/50 bg-amber-950/40 p-3 text-sm text-amber-100">
          Set <code className="rounded bg-stone-900 px-1">SUBSCRIBESTAR_RELAY_CREATOR_CLIENT_ID</code>{" "}
          (API runtime / web server env) or{" "}
          <code className="rounded bg-stone-900 px-1">NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CLIENT_ID</code> in{" "}
          <code className="rounded bg-stone-900 px-1">web/.env.local</code>.
        </p>
      ) : legacyConnect && !redirectUri ? (
        <p className="text-sm text-stone-400">Preparing OAuth link…</p>
      ) : legacyConnect && authorizeUrlLegacy ? (
        <a
          href={authorizeUrlLegacy}
          className="inline-block rounded bg-amber-500 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-amber-400"
        >
          Continue to SubscribeStar (legacy)
        </a>
      ) : null}
    </main>
  );
}
