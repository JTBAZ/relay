"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  describeRelayCrossPostFailure,
  sendRelayCrossPostToExtension
} from "@/lib/relay-extension-messaging";

type PublishToDeviantArtButtonProps = {
  relayPostId: string;
  disabled?: boolean;
  className?: string;
  onSuccess?: () => void;
};

export function PublishToDeviantArtButton({
  relayPostId,
  disabled = false,
  className = "",
  onSuccess
}: PublishToDeviantArtButtonProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setStatus("idle");
    setMessage(null);
    try {
      const result = await sendRelayCrossPostToExtension(relayPostId, "deviantart");
      if (result.ok) {
        setStatus("success");
        setMessage(
          "Opening DeviantArt submit with your Relay draft. Review the deviation there and publish manually."
        );
        onSuccess?.();
        return;
      }
      setStatus("error");
      setMessage(describeRelayCrossPostFailure(result));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={disabled || busy || !relayPostId.trim()}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--lib-border)] bg-[var(--lib-input)] px-4 text-xs font-semibold text-[var(--lib-fg)] enabled:hover:border-[var(--lib-primary)]/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {busy ? "Opening DeviantArt…" : "Post to DeviantArt"}
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
