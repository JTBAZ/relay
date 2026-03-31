"use client";

import { useState } from "react";
import Link from "next/link";
import { RELAY_API_BASE } from "@/lib/relay-api";

type Status = "idle" | "saving" | "saved" | "checking" | "error";

export default function PatreonCookiePage() {
  const [creatorId, setCreatorId] = useState("dev_creator");
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [hasCookie, setHasCookie] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function checkStatus() {
    setStatus("checking");
    setMessage(null);
    try {
      const res = await fetch(
        `${RELAY_API_BASE}/api/v1/patreon/cookie/status?creator_id=${encodeURIComponent(creatorId.trim())}`,
      );
      const json = (await res.json()) as {
        data?: { has_cookie?: boolean };
        error?: { message?: string };
      };
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error?.message ?? `HTTP ${res.status}`);
        return;
      }
      setHasCookie(json.data?.has_cookie ?? false);
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setMessage((e as Error).message);
    }
  }

  async function saveCookie() {
    if (!sessionId.trim()) {
      setStatus("error");
      setMessage("Paste your session_id value first.");
      return;
    }
    setStatus("saving");
    setMessage(null);
    try {
      const res = await fetch(`${RELAY_API_BASE}/api/v1/patreon/cookie`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creator_id: creatorId.trim(),
          session_id: sessionId.trim()
        })
      });
      const json = (await res.json()) as {
        data?: { status?: string };
        error?: { message?: string };
      };
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error?.message ?? `HTTP ${res.status}`);
        return;
      }
      setStatus("saved");
      setHasCookie(true);
      setMessage("Cookie stored (encrypted). Run a scrape to fetch media.");
      setSessionId("");
    } catch (e) {
      setStatus("error");
      setMessage((e as Error).message);
    }
  }

  async function removeCookie() {
    setStatus("saving");
    setMessage(null);
    try {
      const res = await fetch(`${RELAY_API_BASE}/api/v1/patreon/cookie`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ creator_id: creatorId.trim() })
      });
      const json = (await res.json()) as {
        data?: { removed?: boolean };
        error?: { message?: string };
      };
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error?.message ?? `HTTP ${res.status}`);
        return;
      }
      setHasCookie(false);
      setStatus("idle");
      setMessage("Cookie removed.");
    } catch (e) {
      setStatus("error");
      setMessage((e as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 p-8 text-stone-200">
      <p>
        <Link
          href="/"
          className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300"
        >
          ← Gallery
        </Link>
        {" · "}
        <Link
          href="/patreon/connect"
          className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300"
        >
          OAuth Connect
        </Link>
      </p>

      <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
        Patreon Session Cookie
      </h1>

      <p className="text-sm text-stone-300">
        Patreon&apos;s API does not expose post images through OAuth tokens. To download your own
        images and attachments, provide your browser session cookie. This is stored{" "}
        <strong className="text-stone-100">encrypted</strong> on the relay server and used only
        to access <em>your</em> content.
      </p>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-stone-200">Relay creator_id</span>
        <input
          className="w-full rounded border border-stone-600 bg-stone-100 px-3 py-2 text-stone-900 placeholder:text-stone-500"
          value={creatorId}
          onChange={(e) => setCreatorId(e.target.value)}
          placeholder="dev_creator"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={checkStatus}
          disabled={status === "checking"}
          className="rounded bg-stone-700 px-3 py-1.5 text-sm text-stone-200 hover:bg-stone-600 disabled:opacity-50"
        >
          {status === "checking" ? "Checking…" : "Check status"}
        </button>
        {hasCookie !== null && (
          <span className={`text-sm ${hasCookie ? "text-emerald-300" : "text-stone-400"}`}>
            {hasCookie ? "Cookie stored" : "No cookie stored"}
          </span>
        )}
      </div>

      <hr className="border-stone-700" />

      <details className="rounded border border-stone-700 bg-stone-900/60 p-4 text-sm text-stone-300">
        <summary className="cursor-pointer font-medium text-stone-100">
          How to get your session_id
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>
            Open{" "}
            <a
              href="https://www.patreon.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 underline hover:text-amber-300"
            >
              patreon.com
            </a>{" "}
            and make sure you&apos;re logged in.
          </li>
          <li>
            Open DevTools:{" "}
            <kbd className="rounded bg-stone-800 px-1.5 py-0.5 font-mono text-xs text-stone-200">
              F12
            </kbd>{" "}
            or{" "}
            <kbd className="rounded bg-stone-800 px-1.5 py-0.5 font-mono text-xs text-stone-200">
              Ctrl+Shift+I
            </kbd>
          </li>
          <li>
            Go to the <strong className="text-stone-100">Application</strong> tab →{" "}
            <strong className="text-stone-100">Cookies</strong> →{" "}
            <code className="rounded bg-stone-800 px-1 text-stone-200">
              https://www.patreon.com
            </code>
          </li>
          <li>
            Find the cookie named{" "}
            <code className="rounded bg-stone-800 px-1 text-amber-200">session_id</code> and
            copy its <strong className="text-stone-100">Value</strong>.
          </li>
          <li>Paste it below and click &quot;Save Cookie&quot;.</li>
        </ol>
        <p className="mt-3 text-xs text-stone-400">
          This cookie typically expires in ~30 days. You&apos;ll need to update it when it expires.
          Your cookie is encrypted at rest and never leaves the relay server.
        </p>
      </details>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-stone-200">session_id value</span>
        <textarea
          className="w-full rounded border border-stone-600 bg-stone-100 px-3 py-2 font-mono text-sm text-stone-900 placeholder:text-stone-500"
          rows={3}
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          placeholder="Paste your session_id cookie value here…"
        />
        <span className="text-xs text-stone-400">
          This value is sent to your relay server and stored encrypted. It is never sent anywhere
          else.
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={saveCookie}
          disabled={status === "saving" || !sessionId.trim()}
          className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save Cookie"}
        </button>
        {hasCookie && (
          <button
            onClick={removeCookie}
            disabled={status === "saving"}
            className="rounded bg-red-900/60 px-3 py-2 text-sm text-red-200 hover:bg-red-900 disabled:opacity-50"
          >
            Remove Cookie
          </button>
        )}
      </div>

      {status === "error" && message && (
        <pre className="whitespace-pre-wrap rounded border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {message}
        </pre>
      )}
      {status === "saved" && message && (
        <p className="rounded border border-emerald-500/30 bg-emerald-950/40 p-3 text-sm text-emerald-200">
          {message}
        </p>
      )}
      {status === "idle" && message && (
        <p className="text-sm text-stone-400">{message}</p>
      )}
    </main>
  );
}
