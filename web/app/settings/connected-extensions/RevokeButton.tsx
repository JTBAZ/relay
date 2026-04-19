"use client";

import { useState } from "react";
import { relayFetch } from "@/lib/relay-api";

type Props = {
  tokenId: string;
  label: string;
  onRevoked: () => void;
};

export function RevokeButton({ tokenId, label, onRevoked }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (
      !window.confirm(
        `Revoke extension access for "${label || "this device"}"? The extension will need to connect again.`
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await relayFetch<{ token_id: string; revoked: boolean }>(
        `/api/v1/auth/extension/grants/${encodeURIComponent(tokenId)}`,
        { method: "DELETE" }
      );
      onRevoked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={revoke}
        disabled={pending}
        className="rounded bg-red-900/60 px-3 py-1.5 text-sm text-red-100 hover:bg-red-900 disabled:opacity-50"
      >
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {error && <span className="max-w-[12rem] text-right text-xs text-red-300">{error}</span>}
    </div>
  );
}
