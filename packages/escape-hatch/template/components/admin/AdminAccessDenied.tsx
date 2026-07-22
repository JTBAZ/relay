import Link from "next/link";
import type { AdminReadDeniedReason } from "@/lib/identity/admin-access";

type Props = {
  reason: AdminReadDeniedReason;
};

/**
 * Fail-closed admin surface when Supabase identity is configured but the
 * visitor is not staff. Soft personas never unlock inventory.
 */
export function AdminAccessDenied({ reason }: Props) {
  const title =
    reason === "sign_in_required"
      ? "Sign in required"
      : "Staff membership required";
  const body =
    reason === "sign_in_required"
      ? "Supabase identity is configured. Sign in with a staff account to load admin inventory. Soft demo personas do not authorize admin reads."
      : "You are signed in, but this account has no admin/operator membership for this site. Inventory is withheld. Soft demo personas and client tier_ids are not authorization.";

  return (
    <section className="admin-banner admin-banner--degraded" aria-live="polite">
      <p>
        <strong>{title}</strong> — {body}
      </p>
      {reason === "sign_in_required" ? (
        <p className="small">
          <Link href="/login" className="admin-link-btn">
            Sign in
          </Link>
        </p>
      ) : null}
    </section>
  );
}
