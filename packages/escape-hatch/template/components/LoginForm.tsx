"use client";

import { useState, type FormEvent } from "react";
import { tryCreateBrowserSupabaseClient } from "@/lib/supabase/client";

/**
 * Minimal magic-link login. Session cookies are set by the auth callback route.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage(null);

    const supabase = tryCreateBrowserSupabaseClient();
    if (!supabase) {
      setStatus("error");
      setMessage("Identity not configured.");
      return;
    }

    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${origin}/auth/callback`
      }
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("sent");
    setMessage("Check your email for the sign-in link.");
  }

  return (
    <form className="eh-login-form" onSubmit={onSubmit}>
      <label className="eh-login-label" htmlFor="eh-login-email">
        Email
      </label>
      <input
        id="eh-login-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="eh-login-input"
        disabled={status === "sending" || status === "sent"}
      />
      <button
        type="submit"
        className="admin-link-btn"
        disabled={status === "sending" || status === "sent"}
      >
        {status === "sending" ? "Sending…" : "Email magic link"}
      </button>
      {message ? (
        <p
          className={status === "error" ? "eh-login-error" : "eh-login-ok"}
          role="status"
        >
          {message}
        </p>
      ) : null}
      <p className="small muted">
        Service role keys are never used in this form. Premium media stays
        server-gated via /api/media after entitlement checks.
      </p>
    </form>
  );
}
