"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthBootSplash } from "@/app/components/auth/AuthBootSplash";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { bootstrapStudioAfterSupabase } from "@/lib/relay-auth-bootstrap";
import { resolvePostAuthPath } from "@/lib/post-login-redirect";
import { emitStudioSessionUpdate } from "@/lib/studio-session-context";

/**
 * Supabase email confirmation callback.
 * Handles both PKCE (?code=...) and implicit (#access_token=...) flows.
 * Supabase Dashboard → Auth → URL Configuration → set Site URL and add this as a redirect URL:
 *   http://localhost:3000/auth/confirm   (dev)
 *   https://relayapp.me/auth/confirm     (production)
 */
export default function AuthConfirmPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowserClient();
    if (!sb) {
      setStatus("error");
      setError("Supabase is not configured.");
      return;
    }

    (async () => {
      try {
        // PKCE flow: ?code=...
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (code) {
          const { data, error: exchErr } = await sb.auth.exchangeCodeForSession(code);
          if (exchErr) throw exchErr;
          const token = data.session?.access_token;
          if (!token) throw new Error("No session after code exchange.");
          const boot = await bootstrapStudioAfterSupabase(token);
          emitStudioSessionUpdate();
          router.replace(
            boot.created ? "/onboarding?step=patreon" : resolvePostAuthPath("/")
          );
          return;
        }

        // Implicit flow: #access_token=... (Supabase JS auto-processes hash on getSession)
        const hash = window.location.hash;
        if (hash.includes("access_token")) {
          // Give the client a tick to process the hash
          await new Promise((r) => setTimeout(r, 100));
          const { data, error: sessErr } = await sb.auth.getSession();
          if (sessErr) throw sessErr;
          const token = data.session?.access_token;
          if (!token) throw new Error("No session found from email link.");
          const boot = await bootstrapStudioAfterSupabase(token);
          emitStudioSessionUpdate();
          router.replace(
            boot.created ? "/onboarding?step=patreon" : resolvePostAuthPath("/")
          );
          return;
        }

        // Error in hash (e.g. expired OTP)
        if (hash.includes("error")) {
          const hashParams = new URLSearchParams(hash.slice(1));
          const desc = hashParams.get("error_description") ?? hashParams.get("error") ?? "Unknown error from Supabase.";
          throw new Error(decodeURIComponent(desc.replace(/\+/g, " ")));
        }

        throw new Error("No code or token found in URL. Try signing in again.");
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [router]);

  if (status === "working") {
    return <AuthBootSplash message="Confirming your account…" />;
  }

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-4"
      style={{ background: "#0A0A0A", color: "#F9FAFB" }}
    >
      <div className="w-full max-w-sm space-y-4 rounded-xl border p-6" style={{ background: "#111111", borderColor: "#2A2A2A" }}>
        <h1 className="text-base font-semibold" style={{ color: "#F9FAFB" }}>Confirmation failed</h1>
        <p className="text-sm" style={{ color: "#F87171" }}>{error}</p>
        <a
          href="/onboarding"
          className="block rounded-lg py-2.5 text-center text-sm font-medium"
          style={{ background: "#2D6A4F", color: "#F9FAFB" }}
        >
          Try signing up again
        </a>
      </div>
    </div>
  );
}
