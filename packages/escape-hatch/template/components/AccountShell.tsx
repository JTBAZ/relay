import Link from "next/link";
import type { AccountSummaryView } from "@/lib/paywall/types";
import { SignOutButton } from "@/components/SignOutButton";

type Props = {
  summary: AccountSummaryView;
  displayName: string;
  communityCta?: { label: string; href: string } | null;
};

function providerLabel(provider: AccountSummaryView["provider"]): string {
  switch (provider) {
    case "supabase":
      return "Supabase (Path A)";
    case "portable":
      return "Portable Postgres (Path B)";
    case "invalid":
      return "Invalid provider";
    default:
      return "None (local preview)";
  }
}

/**
 * Account surface shell — session, entitlement summary, CTAs (EH-034).
 */
export function AccountShell({ summary, displayName, communityCta }: Props) {
  return (
    <div className="eh-account">
      <header className="eh-account-header">
        <p className="eyebrow">Account</p>
        <h1>{displayName}</h1>
        <p className="lede">
          Membership and sign-in for this site. Access decisions are server-side —
          the browser never unlocks premium media on its own.
        </p>
        <p className="meta muted">productionSafe: false · EH-034 account / paywall UX</p>
      </header>

      <section className="eh-account-panel" aria-labelledby="eh-account-session">
        <h2 id="eh-account-session">Session</h2>
        <dl className="eh-account-dl">
          <div>
            <dt>Identity provider</dt>
            <dd>{providerLabel(summary.provider)}</dd>
          </div>
          <div>
            <dt>Signed in</dt>
            <dd>{summary.signedIn ? "Yes" : "No"}</dd>
          </div>
          {summary.email ? (
            <div>
              <dt>Email</dt>
              <dd>{summary.email}</dd>
            </div>
          ) : null}
          {summary.role ? (
            <div>
              <dt>Role</dt>
              <dd>{summary.role}</dd>
            </div>
          ) : null}
        </dl>

        {summary.signedIn ? (
          <SignOutButton redirectHint="/account" />
        ) : summary.provider === "supabase" || summary.provider === "portable" ? (
          <p className="eh-account-actions">
            <Link className="admin-link-btn" href="/login">
              Sign in
            </Link>
          </p>
        ) : summary.provider === "none" ? (
          <p className="eh-account-note" role="note">
            Soft persona preview is available on the gallery when identity is unset.
            Personas never become entitlements under Path A/B.
          </p>
        ) : (
          <p className="eh-account-note" role="status">
            Fix <span className="mono">ESCAPE_HATCH_IDENTITY_PROVIDER</span> before
            signing in.
          </p>
        )}
      </section>

      <section
        className="eh-account-panel"
        aria-labelledby="eh-account-membership"
      >
        <h2 id="eh-account-membership">Membership</h2>
        <p
          className={
            summary.entitlement.ok
              ? "eh-account-note"
              : "eh-account-note eh-account-note--denied"
          }
          role="status"
        >
          {summary.entitlement.detail}
        </p>
        <dl className="eh-account-dl">
          <div>
            <dt>Source</dt>
            <dd>{summary.entitlement.source ?? "—"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{summary.entitlement.status ?? "—"}</dd>
          </div>
          <div>
            <dt>Tiers</dt>
            <dd>
              {summary.entitlement.tierIds.length
                ? summary.entitlement.tierIds.join(", ")
                : "—"}
            </dd>
          </div>
          {summary.entitlement.observedAt ? (
            <div>
              <dt>Observed</dt>
              <dd>
                <time dateTime={summary.entitlement.observedAt}>
                  {summary.entitlement.observedAt}
                </time>
              </dd>
            </div>
          ) : null}
          {summary.entitlement.expiresAt ? (
            <div>
              <dt>Expires</dt>
              <dd>
                <time dateTime={summary.entitlement.expiresAt}>
                  {summary.entitlement.expiresAt}
                </time>
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="eh-account-panel" aria-labelledby="eh-account-support">
        <h2 id="eh-account-support">Upgrade / support</h2>
        <p className="eh-account-note">{summary.billingNote}</p>
        <div className="eh-account-actions">
          {communityCta ? (
            <a
              className="admin-link-btn"
              href={communityCta.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {communityCta.label}
            </a>
          ) : null}
          <Link className="admin-link-btn admin-link-btn--ghost" href="/preview">
            Back to gallery
          </Link>
        </div>
      </section>
    </div>
  );
}
