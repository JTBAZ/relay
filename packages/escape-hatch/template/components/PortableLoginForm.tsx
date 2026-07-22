"use client";

import { useState, type FormEvent } from "react";

/**
 * Portable email + password login (Path B). Session cookie is httpOnly (server-set).
 */
export function PortableLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage(null);

    try {
      const res = await fetch("/auth/portable/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password
        })
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        setStatus("error");
        setMessage(body?.error ?? "Sign-in failed.");
        return;
      }
      setStatus("ok");
      setMessage("Signed in. Redirecting…");
      window.location.assign("/admin");
    } catch {
      setStatus("error");
      setMessage("Sign-in request failed.");
    }
  }

  return (
    <form className="eh-login-form" onSubmit={onSubmit}>
      <label className="eh-login-label" htmlFor="eh-portable-email">
        Email
      </label>
      <input
        id="eh-portable-email"
        name="email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="eh-login-input"
        disabled={status === "sending" || status === "ok"}
      />
      <label className="eh-login-label" htmlFor="eh-portable-password">
        Password
      </label>
      <input
        id="eh-portable-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="eh-login-input"
        disabled={status === "sending" || status === "ok"}
      />
      <button
        type="submit"
        className="admin-link-btn"
        disabled={status === "sending" || status === "ok"}
      >
        {status === "sending" ? "Signing in…" : "Sign in"}
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
        Passwords are verified server-side with scrypt hashes. Session cookies
        are httpOnly. Soft personas never authorize admin. Premium media remains
        EH-033.
      </p>
    </form>
  );
}
