"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  variant?: string;
  onSuccess?: () => void;
}

export function StudioSupabaseSignInPanel({ onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const inputClass =
    "w-full rounded-xl border border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-4 py-3 text-sm text-[var(--relay-fg)] placeholder-[var(--relay-fg-muted)] outline-none transition-all duration-200 focus:border-[var(--relay-electric)]/60 focus:ring-1 focus:ring-[var(--relay-electric)]/20 focus:shadow-[0_0_12px_0_var(--relay-glow)]";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await new Promise((r) => setTimeout(r, 800));
    setBusy(false);
    setSent(true);
    onSuccess?.();
  };

  if (sent) {
    return (
      <div className="rounded-xl border border-[var(--relay-electric)]/25 bg-[var(--relay-electric)]/8 px-5 py-4 text-sm text-[var(--relay-electric)]">
        Check your inbox — we sent a verification link to{" "}
        <span className="font-medium">{email}</span>.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="creator-email" className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]">
          Email
        </label>
        <input
          id="creator-email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="creator-password" className="text-xs font-medium uppercase tracking-wider text-[var(--relay-fg-muted)]">
          Password
        </label>
        <input
          id="creator-password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Create a strong password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--relay-electric)] px-5 py-3 text-sm font-bold text-white transition-colors duration-200 hover:bg-[var(--relay-green-600)] disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Creating account…
          </>
        ) : (
          "Make My Gallery"
        )}
      </button>
    </form>
  );
}
