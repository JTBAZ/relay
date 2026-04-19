"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { isRecognizedRelayExtensionId, parseRelayExtensionIds } from "@/lib/relay-extension-ids";
import { relayFetch } from "@/lib/relay-api";

type AuthorizeStatus = "idle" | "authorizing" | "connected" | "error";

type ExtensionRuntime = {
  sendMessage(extensionId: string, message: unknown): Promise<unknown> | void;
};

function getExtensionRuntime(): ExtensionRuntime | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    chrome?: { runtime?: ExtensionRuntime };
    browser?: { runtime?: ExtensionRuntime };
  };
  return w.chrome?.runtime ?? w.browser?.runtime ?? null;
}

async function sendConsentCodeToExtension(extId: string, code: string): Promise<void> {
  const runtime = getExtensionRuntime();
  if (!runtime?.sendMessage) {
    throw new Error(
      "Could not reach the extension from this page. Use Chrome or Firefox with the Relay extension installed, or open this tab from the extension."
    );
  }
  const out = runtime.sendMessage(extId, { type: "RELAY_CONSENT_CODE", code });
  if (out && typeof (out as Promise<unknown>).then === "function") {
    await out;
  }
}

export function AuthorizeClient() {
  const searchParams = useSearchParams();
  const extId = searchParams.get("ext_id")?.trim() ?? "";
  const installationId = searchParams.get("installation_id")?.trim() ?? "";
  const labelRaw = searchParams.get("label")?.trim() ?? "";

  const labelPreview = useMemo(() => {
    if (!labelRaw) return null;
    try {
      return decodeURIComponent(labelRaw);
    } catch {
      return labelRaw;
    }
  }, [labelRaw]);

  const allowed = useMemo(() => parseRelayExtensionIds(), []);
  const recognized = extId.length > 0 && isRecognizedRelayExtensionId(extId);
  const missingParams = !extId || !installationId;

  const [status, setStatus] = useState<AuthorizeStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const onAuthorize = useCallback(async () => {
    setMessage(null);
    setStatus("authorizing");
    try {
      const data = await relayFetch<{ consent_code: string; expires_at: string }>(
        "/api/v1/auth/extension/consent/start",
        {
          method: "POST",
          body: JSON.stringify({ installation_id: installationId })
        }
      );
      const code = data.consent_code;
      if (!code) {
        throw new Error("Relay did not return a consent code.");
      }
      await sendConsentCodeToExtension(extId, code);
      setStatus("connected");
    } catch (e) {
      setStatus("error");
      setMessage((e as Error).message);
    }
  }, [extId, installationId]);

  if (missingParams) {
    return (
      <main className="mx-auto max-w-lg space-y-4 p-8 text-stone-200">
        <p>
          <Link
            href="/"
            className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300"
          >
            ← Gallery
          </Link>
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
          Connect extension
        </h1>
        <p className="rounded border border-amber-500/40 bg-amber-950/40 p-4 text-sm text-amber-100">
          This page must be opened from the Relay browser extension. Missing{" "}
          {!extId && <strong className="text-amber-50"> ext_id</strong>}
          {!extId && !installationId && " and "}
          {!installationId && <strong className="text-amber-50"> installation_id</strong>} in
          the URL.
        </p>
      </main>
    );
  }

  if (allowed.size === 0 || !recognized) {
    return (
      <main className="mx-auto max-w-lg space-y-4 p-8 text-stone-200">
        <p>
          <Link
            href="/"
            className="text-amber-400 underline decoration-amber-400/60 hover:text-amber-300"
          >
            ← Gallery
          </Link>
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
          Connect extension
        </h1>
        <div className="rounded border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-100">
          <p className="font-medium text-red-50">This extension is not recognized.</p>
          <p className="mt-2 text-red-200/90">
            Only official Relay extensions configured for this site can connect. If you are
            developing locally, set{" "}
            <code className="rounded bg-red-900/50 px-1">NEXT_PUBLIC_RELAY_EXTENSION_IDS</code> to
            your unpacked extension id.
          </p>
        </div>
      </main>
    );
  }

  if (status === "connected") {
    return (
      <main className="mx-auto max-w-lg space-y-4 p-8 text-stone-200">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
          Connect extension
        </h1>
        <p className="rounded border border-emerald-500/40 bg-emerald-950/40 p-4 text-emerald-100">
          Connected ✓ — you can close this tab.
        </p>
      </main>
    );
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
      </p>

      <h1 className="font-[family-name:var(--font-display)] text-2xl text-stone-50">
        Authorize Relay extension
      </h1>

      <div className="space-y-4 rounded border border-stone-600 bg-stone-900/60 p-6">
        <p className="text-sm text-stone-300">
          <strong className="text-stone-100">Relay browser extension</strong>
          {labelPreview ? (
            <>
              {" "}
              <span className="text-stone-400">·</span>{" "}
              <span className="text-stone-200">{labelPreview}</span>
            </>
          ) : null}
        </p>

        <p className="text-sm leading-relaxed text-stone-300">
          If you continue, the extension may{" "}
          <strong className="text-stone-100">
            read your Patreon session_id and store it encrypted in your Relay account
          </strong>{" "}
          so your studio can sync media that Patreon&apos;s OAuth API does not expose. Relay never
          shows your cookie value on this page.
        </p>

        <button
          type="button"
          onClick={onAuthorize}
          disabled={status === "authorizing"}
          className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {status === "authorizing" ? "Authorizing…" : "Authorize"}
        </button>
      </div>

      {status === "error" && message && (
        <pre className="whitespace-pre-wrap rounded border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {message}
        </pre>
      )}
    </main>
  );
}
