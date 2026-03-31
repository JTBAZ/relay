"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/**
 * Dev helper: builds Patreon’s authorize URL. Uses NEXT_PUBLIC_PATREON_CLIENT_ID
 * and NEXT_PUBLIC_PATREON_REDIRECT_URI (must match your Patreon app + portal exactly).
 */
export default function PatreonConnectPage() {
  const [creatorId, setCreatorId] = useState("dev_creator");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const clientId = process.env.NEXT_PUBLIC_PATREON_CLIENT_ID ?? "";
  const envRedirect = process.env.NEXT_PUBLIC_PATREON_REDIRECT_URI?.trim();
  /** Prefer explicit env; otherwise current browser origin (correct for :3001, etc.). */
  const redirectUri = envRedirect || (origin ? `${origin}/patreon/callback` : "");

  const authorizeUrl = useMemo(() => {
    if (!clientId.trim() || !redirectUri) return "";
    const u = new URL("https://www.patreon.com/oauth2/authorize");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", clientId.trim());
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set(
      "scope",
      "identity campaigns campaigns.posts"
    );
    u.searchParams.set("state", creatorId.trim() || "dev_creator");
    return u.toString();
  }, [clientId, redirectUri, creatorId]);

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
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
        Connect Patreon (dev)
      </h1>
      <p className="text-sm text-stone-300">
        The <strong className="text-stone-100">Client ID</strong> here is public (same as in
        Patreon’s portal). Your <strong className="text-stone-100">Client Secret</strong> stays
        only in the Relay API <code className="rounded bg-stone-800 px-1 py-0.5 text-stone-200">.env</code>{" "}
        — never in Next.js{" "}
        <code className="rounded bg-stone-800 px-1 py-0.5 text-stone-200">NEXT_PUBLIC_*</code>.
      </p>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-stone-200">Relay creator_id</span>
        <input
          className="w-full rounded border border-stone-600 bg-stone-100 px-3 py-2 text-stone-900 placeholder:text-stone-500"
          value={creatorId}
          onChange={(e) => setCreatorId(e.target.value)}
          placeholder="dev_creator"
        />
        <span className="text-xs text-stone-400">
          Passed as OAuth <code className="rounded bg-stone-800 px-1 text-stone-200">state</code> and
          sent to{" "}
          <code className="rounded bg-stone-800 px-1 text-stone-200">/api/v1/auth/patreon/exchange</code>.
        </span>
      </label>
      <p className="text-xs text-stone-400">
        Redirect URI sent to Patreon:{" "}
        {redirectUri ? (
          <code className="break-all rounded bg-stone-800 px-1.5 py-0.5 text-amber-200">{redirectUri}</code>
        ) : (
          <span className="text-amber-300">detecting from your browser…</span>
        )}
        <br />
        Must match a URI in your Patreon app settings exactly.
        {!envRedirect && origin ? (
          <>
            <br />
            <span className="text-stone-400">
              Using this tab’s origin. For a fixed port, set{" "}
              <code className="rounded bg-stone-800 px-1 text-stone-200">NEXT_PUBLIC_PATREON_REDIRECT_URI</code>{" "}
              in <code className="rounded bg-stone-800 px-1 text-stone-200">.env.local</code>.
            </span>
          </>
        ) : null}
      </p>
      {!clientId.trim() ? (
        <p className="rounded border border-amber-600/50 bg-amber-950/40 p-3 text-sm text-amber-100">
          Set <code className="rounded bg-stone-900 px-1">NEXT_PUBLIC_PATREON_CLIENT_ID</code> in{" "}
          <code className="rounded bg-stone-900 px-1">web/.env.local</code> (see{" "}
          <code className="rounded bg-stone-900 px-1">web/.env.example</code>).
        </p>
      ) : !redirectUri ? (
        <p className="text-sm text-stone-400">Preparing OAuth link…</p>
      ) : (
        <a
          href={authorizeUrl}
          className="inline-block rounded bg-amber-500 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-amber-400"
        >
          Continue to Patreon
        </a>
      )}
    </main>
  );
}
