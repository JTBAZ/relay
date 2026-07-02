"use client";

import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  crossPostBlueskyPost,
  fetchCreatorBlueskyCredential,
  putCreatorBlueskyCredential,
  type CreatorBlueskyCredentialWire
} from "@/lib/relay-api";

type PublishToBlueskyButtonProps = {
  relayPostId: string;
  disabled?: boolean;
  className?: string;
  onSuccess?: () => void;
};

export function PublishToBlueskyButton({
  relayPostId,
  disabled = false,
  className = "",
  onSuccess
}: PublishToBlueskyButtonProps) {
  const formId = useId();
  const [credential, setCredential] = useState<CreatorBlueskyCredentialWire | null | "loading">(
    "loading"
  );
  const [showConnect, setShowConnect] = useState(false);
  const [handle, setHandle] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    void fetchCreatorBlueskyCredential()
      .then(({ credential: cred }) => {
        if (!cancelled) setCredential(cred);
      })
      .catch(() => {
        if (!cancelled) setCredential(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const { credential: saved } = await putCreatorBlueskyCredential({
        handle,
        app_password: appPassword
      });
      setCredential(saved);
      setShowConnect(false);
      setAppPassword("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (!credential || credential === "loading") {
      setShowConnect(true);
      return;
    }
    setBusy(true);
    setStatus("idle");
    setMessage(null);
    try {
      await crossPostBlueskyPost(relayPostId);
      setStatus("success");
      setMessage("Published to Bluesky.");
      onSuccess?.();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (credential === "loading") {
    return (
      <div className={`text-xs text-[var(--lib-fg-muted)] ${className}`}>
        Checking Bluesky…
      </div>
    );
  }

  return (
    <div className={className}>
      {showConnect || !credential ? (
        <form onSubmit={(e) => void onConnect(e)} className="mb-3 rounded-md border border-[var(--lib-border)] bg-[var(--lib-muted)]/20 p-3">
          <p className="text-[11px] font-medium text-[var(--lib-fg)]">Connect Bluesky</p>
          <p className="mt-1 text-[10px] text-[var(--lib-fg-muted)]">
            Use a Bluesky app password (Settings → App passwords). Relay stores it encrypted.
          </p>
          <div className="mt-2 space-y-2">
            <input
              id={`${formId}-handle`}
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="you.bsky.social"
              className="w-full rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-2 py-1.5 text-xs"
              disabled={busy}
            />
            <input
              id={`${formId}-password`}
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder="App password"
              className="w-full rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-2 py-1.5 text-xs"
              disabled={busy}
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 text-xs font-semibold text-[var(--lib-primary)] disabled:opacity-50"
          >
            Save Bluesky connection
          </button>
        </form>
      ) : (
        <p className="mb-2 text-[10px] text-[var(--lib-fg-muted)]">
          Connected as @{credential.handle}
        </p>
      )}

      <button
        type="button"
        onClick={() => void onPublish()}
        disabled={disabled || busy || !relayPostId.trim()}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-4 text-xs font-semibold text-[var(--lib-fg)] enabled:hover:border-[var(--lib-primary)]/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {busy ? "Publishing…" : "Post to Bluesky"}
      </button>

      {message ? (
        <p
          className={`mt-2 text-xs ${
            status === "success" ? "text-emerald-200" : "text-amber-200"
          }`}
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
