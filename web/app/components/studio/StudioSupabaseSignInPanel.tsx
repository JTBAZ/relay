"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { bootstrapStudioAfterSupabase } from "@/lib/relay-auth-bootstrap";
import { emitStudioSessionUpdate } from "@/lib/studio-session-context";

type Variant = "login" | "onboarding";

export function StudioSupabaseSignInPanel({
  variant,
  onSuccess,
}: {
  variant: Variant;
  /** Called after bootstrap completes — if provided, navigation is skipped (wizard uses this). */
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || "/";

  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabaseConfigured = typeof window !== "undefined" && Boolean(getSupabaseBrowserClient());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const sb = getSupabaseBrowserClient();
    if (!sb) {
      setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_STAGING_URL and ANON key in web/.env.local.");
      return;
    }
    if (!email.includes("@") || password.length < 6) {
      setError("Enter a valid email and password (min 6 characters).");
      return;
    }
    setBusy(true);
    try {
      if (mode === "sign-up") {
        const confirmUrl = `${window.location.origin}/auth/confirm`;
        const { data, error: upErr } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: confirmUrl },
        });
        if (upErr) throw upErr;
        // With "Confirm email" on, Supabase returns no error for an already-registered email (anti-enumeration).
        // Real new signups have at least one identity; duplicates get an empty identities array.
        if (data.user?.identities && data.user.identities.length === 0) {
          setError(
            "An account with this email already exists. Use Sign in, or reset your password from the login screen if needed."
          );
          return;
        }
        const token = data.session?.access_token;
        if (!token) {
          // Email confirmation required — Supabase sent a link to confirmUrl
          setError(
            "Check your email for a confirmation link. Click it to activate your account and be signed in automatically."
          );
          return;
        }
        await bootstrapStudioAfterSupabase(token);
        emitStudioSessionUpdate();
        if (onSuccess) { onSuccess(); return; }
        router.push(returnTo.startsWith("/") ? returnTo : "/");
        return;
      }
      const { data, error: inErr } = await sb.auth.signInWithPassword({ email, password });
      if (inErr) throw inErr;
      const token = data.session?.access_token;
      if (!token) throw new Error("No access token from Supabase.");
      await bootstrapStudioAfterSupabase(token);
      emitStudioSessionUpdate();
      if (onSuccess) { onSuccess(); return; }
      router.push(returnTo.startsWith("/") ? returnTo : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const boxStyle =
    variant === "onboarding"
      ? "rounded-lg border border-[var(--relay-border)] bg-[var(--relay-surface-1)] p-5"
      : "rounded-xl border p-5";
  const borderColor = variant === "login" ? "#2A2A2A" : undefined;

  return (
    <div className={boxStyle} style={variant === "login" ? { background: "#111111", borderColor } : undefined}>
      <div className="mb-4 space-y-1">
        <h3
          className="text-sm font-semibold"
          style={{ color: variant === "login" ? "#F9FAFB" : "var(--relay-fg)" }}
        >
          Relay studio (Supabase)
        </h3>
        <p className="text-xs leading-relaxed" style={{ color: variant === "login" ? "#9CA3AF" : "var(--relay-fg-muted)" }}>
          Signs you in, syncs your account, and creates your studio workspace (
          <code className="rounded px-0.5" style={{ background: "#1a1a1a" }}>
            relay_creator_id
          </code>
          ).
        </p>
      </div>

      {!supabaseConfigured && (
        <p className="mb-3 rounded-md border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          Add{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_STAGING_URL</code> and{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_STAGING_ANON_KEY</code> to{" "}
          <code className="rounded bg-black/30 px-1">web/.env.local</code> (see{" "}
          <code className="rounded bg-black/30 px-1">web/.env.example</code>).
        </p>
      )}

      <div
        className="mb-3 flex gap-0.5 rounded-lg p-0.5"
        style={
          variant === "login"
            ? { background: "#111111", border: "1px solid #2A2A2A" }
            : { background: "var(--relay-bg)", border: "1px solid var(--relay-border)" }
        }
        role="tablist"
      >
        {(["sign-in", "sign-up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className="flex-1 rounded-md py-2 text-xs font-medium transition-colors"
            style={
              mode === m
                ? { background: "#1A1A1A", color: "#F9FAFB", border: "1px solid #2A2A2A" }
                : { color: "#9CA3AF", border: "1px solid transparent" }
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
          className="w-full rounded-lg border border-[#2A2A2A] bg-[#0d0d0d] px-3 py-2.5 text-sm text-[#F9FAFB] placeholder:text-[#6B7280] focus:border-[#2D6A4F] focus:outline-none"
        />
        <input
          type="password"
          name="password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-[#2A2A2A] bg-[#0d0d0d] px-3 py-2.5 text-sm text-[#F9FAFB] placeholder:text-[#6B7280] focus:border-[#2D6A4F] focus:outline-none"
        />
        {error && (
          <p className="text-xs text-red-300" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-[#F9FAFB] transition-colors disabled:opacity-50"
          style={{ background: "#2D6A4F" }}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Working…
            </>
          ) : mode === "sign-in" ? (
            "Continue to Library"
          ) : (
            "Create studio workspace"
          )}
        </button>
      </form>

      {variant === "onboarding" && (
        <p className="mt-3 text-center text-xs text-[var(--relay-fg-muted)]">
          Already set up?{" "}
          <Link href="/login" className="text-[var(--relay-green-400)] underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      )}
    </div>
  );
}
