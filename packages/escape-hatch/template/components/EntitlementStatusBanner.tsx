"use client";

import Link from "next/link";
import type { ServerAccessSummary } from "@/lib/paywall/types";

type Props = {
  access: ServerAccessSummary | null | undefined;
  /** When soft persona preview is active (provider none). */
  softPreview?: boolean;
};

/**
 * Compact entitlement honesty strip for post / gallery chrome (EH-034).
 */
export function EntitlementStatusBanner({ access, softPreview = false }: Props) {
  if (softPreview) {
    return (
      <p className="eh-entitlement-banner eh-entitlement-banner--preview" role="status">
        <span className="eh-entitlement-chip">Local preview</span>
        Soft persona is non-authoritative — not a production entitlement.{" "}
        <Link href="/account">Account</Link>
      </p>
    );
  }

  if (!access) {
    return null;
  }

  const provider = access.provider;
  if (provider !== "supabase" && provider !== "portable") {
    return null;
  }

  if (access.allowed) {
    const staff = access.reason === "staff_override";
    return (
      <p
        className={`eh-entitlement-banner ${staff ? "eh-entitlement-banner--staff" : "eh-entitlement-banner--ok"}`}
        role="status"
        data-entitlement-reason={access.reason}
      >
        <span className="eh-entitlement-chip">
          {staff ? "Staff" : access.stale ? "Granted (stale warn)" : "Unlocked"}
        </span>
        {staff
          ? "Staff override — viewing as operator, not as a patron."
          : access.stale
            ? "Access granted; entitlement snapshot marked stale."
            : "Access resolved by server entitlement evaluator."}{" "}
        <Link href="/account">Account</Link>
      </p>
    );
  }

  return (
    <p
      className="eh-entitlement-banner eh-entitlement-banner--denied"
      role="status"
      aria-live="polite"
      data-entitlement-reason={access.reason}
    >
      <span className="eh-entitlement-chip">Locked</span>
      {access.detail || "Premium access denied."} Soft personas do not authorize
      when identity is configured. <Link href="/account">Account</Link>
    </p>
  );
}
