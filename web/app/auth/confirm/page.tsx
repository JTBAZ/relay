"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthBootSplash } from "@/app/components/auth/AuthBootSplash";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  bootstrapStudioAfterSupabase,
  bootstrapSupporterAfterSupabase
} from "@/lib/relay-auth-bootstrap";
import { resolveCreatorPostAuthDestination } from "@/lib/creator-post-login-redirect";
import { resolveSupporterPostAuthDestination } from "@/lib/supporter-post-login-redirect";
import { emitStudioSessionUpdate } from "@/lib/studio-session-context";

const CONFIRM_INTENT_KEY = "relay_auth_confirm_intent";

type ConfirmIntent = "creator" | "supporter";

/**
 * PKCE/implicit: prefer `?intent=supporter|creator` (set by sign-up emailRedirectTo). Then
 * localStorage (set at sign-up; survives opening the link in a new tab). Then sessionStorage
 * (same-tab dev). Default **supporter** so we never auto-provision a studio without an explicit
 * creator handoff.
 */
function resolveEmailConfirmIntent(): ConfirmIntent {
  if (typeof window === "undefined") return "supporter";
  const q = new URLSearchParams(window.location.search).get("intent")?.toLowerCase();
  if (q === "creator" || q === "supporter") {
    return q;
  }
  try {
    const ls = localStorage.getItem(CONFIRM_INTENT_KEY);
    if (ls === "creator" || ls === "supporter") {
      localStorage.removeItem(CONFIRM_INTENT_KEY);
      return ls;
    }
  } catch {
    /* private mode or disabled */
  }
  try {
    const s = sessionStorage.getItem(CONFIRM_INTENT_KEY);
    if (s === "creator" || s === "supporter") {
      sessionStorage.removeItem(CONFIRM_INTENT_KEY);
      return s;
    }
  } catch {
    /* private mode or disabled */
  }
  return "supporter";
}

/**
 * Supabase email confirmation callback.
 * Handles both PKCE (?code=...) and implicit (#access_token=...) flows.
 * Supabase Dashboard → Auth → URL Configuration → set Site URL and add redirect URL patterns, e.g.:
 *   http://localhost:3000/auth/confirm?intent=supporter
 *   http://localhost:3000/auth/confirm?intent=creator
 *   https://relayapp.me/auth/confirm?intent=*
 * (dev — one origin; see docs/qa/DEV_LOCAL_ORIGIN.md)
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
        const intent = resolveEmailConfirmIntent();

        // PKCE flow: ?code=...
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (code) {
          const { data, error: exchErr } = await sb.auth.exchangeCodeForSession(code);
          if (exchErr) throw exchErr;
          const token = data.session?.access_token;
          if (!token) throw new Error("No session after code exchange.");
          if (intent === "creator") {
            const boot = await bootstrapStudioAfterSupabase(token);
            emitStudioSessionUpdate();
            router.replace(await resolveCreatorPostAuthDestination(boot, null));
          } else {
            await bootstrapSupporterAfterSupabase(token);
            emitStudioSessionUpdate();
            router.replace(await resolveSupporterPostAuthDestination(null));
          }
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
          if (intent === "creator") {
            const boot = await bootstrapStudioAfterSupabase(token);
            emitStudioSessionUpdate();
            router.replace(await resolveCreatorPostAuthDestination(boot, null));
          } else {
            await bootstrapSupporterAfterSupabase(token);
            emitStudioSessionUpdate();
            router.replace(await resolveSupporterPostAuthDestination(null));
          }
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
