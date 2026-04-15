"use client";

import Link from "next/link";

/**
 * Legacy tab shell — real email/password studio auth lives in {@link StudioSupabaseSignInPanel} on `/login`.
 */
export function EmailPanel() {
  return (
    <div className="space-y-4 rounded-lg border px-4 py-5" style={{ background: "#111111", borderColor: "#2A2A2A" }}>
      <p className="text-sm" style={{ color: "#F9FAFB" }}>
        Relay studio sign-in
      </p>
      <p className="text-xs leading-relaxed" style={{ color: "#9CA3AF" }}>
        Password sign-in for creators uses <strong style={{ color: "#E5E7EB" }}>Supabase Auth</strong> on the main
        sign-in page. That flow creates your account in our database and opens your Library.
      </p>
      <Link
        href="/login#relay-studio"
        className="inline-flex w-full items-center justify-center rounded-lg py-2.5 text-sm font-medium transition-colors"
        style={{ background: "#2D6A4F", color: "#F9FAFB" }}
      >
        Go to studio sign-in
      </Link>
    </div>
  );
}
