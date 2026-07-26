"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { bootstrapAccountAfterSupabase } from "@/lib/relay-auth-bootstrap";
import { resolveSupporterPostAuthDestination } from "@/lib/supporter-post-login-redirect";
import { getWebAppOrigin } from "@/lib/site-origin";

/**
 * PE-A Skeletal UI — Supporter sign-in / sign-up panel.
 *
 * Mirrors the Studio panel but:
 * - Uses `bootstrapSupporterAfterSupabase` (sync + relay-session, no creator workspace).
 * - After session bootstrap: linked Patreon → `/feed`; else `/connect/patreon/patron/connect`.
 *   Non-default `returnTo` in the query still wins (deep links).
 * - Copy is supporter-flavoured ("supporter account", "Continue to feed").
 */
export function SupporterSignInPanel({ onSuccess }: { onSuccess?: () => void } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnToParam = searchParams.get("returnTo");

  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const showSupabaseWarning = mounted && !getSupabaseBrowserClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const sb = getSupabaseBrowserClient();
    if (!sb) {
      setMessage({ kind: "error", text: "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL in web/.env.local." });
      return;
    }
    if (!email.includes("@") || password.length < 6) {
      setMessage({ kind: "error", text: "Enter a valid email and password (min 6 characters)." });
      return;
    }
    setBusy(true);
    try {
      if (mode === "sign-up") {
        const confirmUrl = `${getWebAppOrigin()}/auth/confirm?intent=supporter`;
        try {
          sessionStorage.setItem("relay_auth_confirm_intent", "supporter");
          localStorage.setItem("relay_auth_confirm_intent", "supporter");
        } catch {
          /* ignore */
        }
        const { data, error: upErr } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: confirmUrl }
        });
        if (upErr) throw upErr;
        if (data.user?.identities && data.user.identities.length === 0) {
          setMessage({
            kind: "error",
            text: "An account with this email already exists. Use Sign in instead."
          });
          return;
        }
        const token = data.session?.access_token;
        if (!token) {
          setMessage({
            kind: "info",
            text: "Check your email for a confirmation link. Click it to activate your account — you'll be signed in automatically."
          });
          return;
        }
        await bootstrapAccountAfterSupabase(token, "supporter");
        if (onSuccess) {
          onSuccess();
        } else {
          router.push(await resolveSupporterPostAuthDestination(returnToParam));
        }
        return;
      }

      const { data, error: inErr } = await sb.auth.signInWithPassword({ email, password });
      if (inErr) throw inErr;
      const token = data.session?.access_token;
      if (!token) throw new Error("No access token from Supabase.");
      await bootstrapAccountAfterSupabase(token, "supporter");
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(await resolveSupporterPostAuthDestination(returnToParam));
      }
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-2xl border p-6 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)]"
      style={{ background: "var(--relay-surface-1)", borderColor: "var(--relay-border)" }}
    >
      <div className="mb-4 space-y-1">
        <h3 className="text-sm font-semibold" style={{ color: "var(--relay-fg)" }}>
          Supporter account
        </h3>
        <p className="text-xs leading-relaxed" style={{ color: "var(--relay-fg-muted)" }}>
          Use the email connected to your Relay account.
        </p>
      </div>

      {showSupabaseWarning && (
        <p className="mb-3 rounded-md border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          Supabase not configured — set{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_URL</code> in{" "}
          <code className="rounded bg-black/30 px-1">web/.env.local</code>.
        </p>
      )}

      <div
        className="mb-3 flex gap-0.5 rounded-xl p-1"
        style={{ background: "var(--relay-bg)", border: "1px solid var(--relay-border)" }}
        role="tablist"
      >
        {(["sign-in", "sign-up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => { setMode(m); setMessage(null); }}
            className="flex-1 rounded-lg py-2 text-xs font-medium transition-colors"
            style={
              mode === m
                ? { background: "var(--relay-surface-2)", color: "var(--relay-fg)", border: "1px solid var(--relay-border)" }
                : { color: "var(--relay-fg-muted)", border: "1px solid transparent" }
            }
          >
            {m === "sign-in" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-xl border border-[var(--relay-border)] bg-[var(--relay-bg)] px-3 py-2.5 text-sm text-[var(--relay-fg)] placeholder:text-[var(--relay-gray-500)] focus:border-[var(--relay-green-600)] focus:outline-none"
        />
        <input
          type="password"
          name="password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl border border-[var(--relay-border)] bg-[var(--relay-bg)] px-3 py-2.5 text-sm text-[var(--relay-fg)] placeholder:text-[var(--relay-gray-500)] focus:border-[var(--relay-green-600)] focus:outline-none"
        />

        {message && (
          <p
            className="text-xs leading-relaxed"
            role="alert"
            style={{ color: message.kind === "error" ? "#fca5a5" : "#a7f3d0" }}
          >
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-[var(--relay-fg)] transition-colors disabled:opacity-50"
          style={{ background: "var(--relay-green-600)" }}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Working…
            </>
          ) : mode === "sign-in" ? (
            "Continue to feed"
          ) : (
            "Create account"
          )}
        </button>
      </form>
    </div>
  );
}
