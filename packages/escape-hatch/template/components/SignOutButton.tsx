"use client";

/**
 * POST-only sign-out control (HTTP verb hygiene — EH-034).
 */
export function SignOutButton({ redirectHint }: { redirectHint?: string }) {
  return (
    <form className="eh-signout-form" method="post" action="/auth/logout">
      {redirectHint ? (
        <input type="hidden" name="next" value={redirectHint} />
      ) : null}
      <button type="submit" className="admin-link-btn eh-signout-btn">
        Sign out
      </button>
      <p className="small muted">Sign-out uses POST only — GET cannot clear the session.</p>
    </form>
  );
}
