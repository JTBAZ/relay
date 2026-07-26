/**
 * Identity session and entitlement types (EH-030).
 * Soft demo personas are separate and never authorize admin or premium server-side.
 */

export type SiteMembershipRole = "admin" | "operator" | "patron";

export type EntitlementSource =
  | "patreon"
  | "billing"
  | "manual"
  | "bootstrap";

export type SiteAuthSession = {
  userId: string;
  email: string | null;
  /** Membership role for the active site when known. */
  role: SiteMembershipRole | null;
  /** Site id the membership/role applies to. */
  siteId: string | null;
};

export type EntitlementSnapshot = {
  siteId: string;
  authUserId: string;
  tierIds: readonly string[];
  source: EntitlementSource;
  reason: string | null;
  observedAt: string;
  staleAfter: string | null;
  /** Optional hard expiry (EH-032). */
  expiresAt: string | null;
  /** Optional revoke timestamp (EH-032). */
  revokedAt: string | null;
};

export type EntitlementReadResult =
  | {
      ok: true;
      snapshot: EntitlementSnapshot;
      stale: boolean;
    }
  | {
      ok: false;
      reason: string;
      /** Fail-closed: no tier access. */
      tierIds: readonly [];
    };

export function isStaffRole(role: SiteMembershipRole | null | undefined): boolean {
  return role === "admin" || role === "operator";
}
