"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  bootstrapAccountAfterSupabase,
  bootstrapStudioAfterSupabase,
} from "@/lib/relay-auth-bootstrap";
import { resolveCreatorPostAuthDestination } from "@/lib/creator-post-login-redirect";
import { emitStudioSessionUpdate } from "@/lib/studio-session-context";
import { getWebAppOrigin } from "@/lib/site-origin";

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
  const [info, setInfo] = useState<string | null>(null);
  /** Avoid hydration mismatch: server has no `window`; client may have Supabase env — defer warning until mounted. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const showSupabaseSetupWarning =
    mounted && !getSupabaseBrowserClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
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
        const confirmUrl = `${getWebAppOrigin()}/auth/confirm?intent=creator`;
        try {
          sessionStorage.setItem("relay_auth_confirm_intent", "creator");
          localStorage.setItem("relay_auth_confirm_intent", "creator");
        } catch {
          /* ignore */
        }
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
          setInfo(
            "Check your email for a confirmation link. Click it to activate your account and be signed in automatically."
          );
          return;
        }
        // Onboarding: unified bootstrap — no workspace provisioned yet. Workspace is deferred
        // to the Patreon connect step (step 3) via StepConnectPatreonCreator.ensureWorkspace().
        // Login: full studio bootstrap for returning creators who already have a workspace.
        if (variant === "onboarding") {
          await bootstrapAccountAfterSupabase(token, "creator");
          emitStudioSessionUpdate();
          onSuccess?.();
          return;
        }
        const boot = await bootstrapStudioAfterSupabase(token);
        emitStudioSessionUpdate();
        if (onSuccess) { onSuccess(); return; }
        router.push(await resolveCreatorPostAuthDestination(boot, returnTo));
        return;
      }
      const { data, error: inErr } = await sb.auth.signInWithPassword({ email, password });
      if (inErr) throw inErr;
      const token = data.session?.access_token;
      if (!token) throw new Error("No access token from Supabase.");
      if (variant === "onboarding") {
        await bootstrapAccountAfterSupabase(token, "creator");
        emitStudioSessionUpdate();
        onSuccess?.();
        return;
      }
      const boot = await bootstrapStudioAfterSupabase(token);
      emitStudioSessionUpdate();
      if (onSuccess) { onSuccess(); return; }
      router.push(await resolveCreatorPostAuthDestination(boot, returnTo));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const boxStyle =
    variant === "onboarding"
      ? "rounded-lg border border-[var(--relay-border)] bg-[var(--relay-surface-1)] p-5"
      : "rounded-2xl border p-6 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.6)]";
  const borderColor = variant === "login" ? "var(--relay-border)" : undefined;

  return (
    <div className={boxStyle} style={variant === "login" ? { background: "var(--relay-surface-1)", borderColor } : undefined}>
      <div className="mb-4 space-y-1">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--relay-fg)" }}
        >
          Creator account
        </h3>
        <p className="text-xs leading-relaxed" style={{ color: "var(--relay-fg-muted)" }}>
          Use the email connected to your Relay studio.
        </p>
      </div>

      {showSupabaseSetupWarning && (
        <p className="mb-3 rounded-md border border-amber-900/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
          Add{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_STAGING_URL</code> and{" "}
          <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_STAGING_ANON_KEY</code> to{" "}
          <code className="rounded bg-black/30 px-1">web/.env.local</code> (see{" "}
          <code className="rounded bg-black/30 px-1">web/.env.example</code>).
        </p>
      )}

      <div
        className="mb-3 flex gap-0.5 rounded-xl p-1"
        style={
          variant === "login"
            ? { background: "var(--relay-bg)", border: "1px solid var(--relay-border)" }
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
              setInfo(null);
            }}
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
        {info && (
          <p className="text-xs text-emerald-200/90" role="status">
            {info}
          </p>
        )}
        {error && (
          <p className="text-xs text-red-300" role="alert">
            {error}
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
            "Continue to Library"
          ) : (
            "Create account"
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
