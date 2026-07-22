import Link from "next/link";
import type { AdminReadDeniedReason } from "@/lib/identity/admin-access";

type Props = {
  reason: AdminReadDeniedReason;
};

/**
 * Fail-closed admin surface when Path A/B identity is active but the
 * visitor is not staff. Soft personas never unlock inventory.
 */
export function AdminAccessDenied({ reason }: Props) {
  const title =
    reason === "provider_invalid"
      ? "Identity provider invalid"
      : reason === "sign_in_required"
        ? "Sign in required"
        : "Staff membership required";
  const body =
    reason === "provider_invalid"
      ? "ESCAPE_HATCH_IDENTITY_PROVIDER must be none, supabase, or portable. Soft demo personas do not authorize admin reads."
      : reason === "sign_in_required"
        ? "An identity path is active. Sign in with a staff account to load admin inventory. Soft demo personas do not authorize admin reads."
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
