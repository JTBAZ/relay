import { redirect } from "next/navigation";
import type { AdminReadDeniedReason } from "../identity/admin-access";

/**
 * When Supabase identity is configured and no session exists, redirect to login.
 * Staff-required denials stay on-page with an empty inventory shell.
 * Soft persona never satisfies this gate.
 */
export function redirectIfAdminSignInRequired(
  readAllowed: boolean,
  denyReason: AdminReadDeniedReason | null,
  loginNext: string
): void {
  if (readAllowed || denyReason !== "sign_in_required") return;
  const safeNext =
    loginNext.startsWith("/") && !loginNext.startsWith("//")
      ? loginNext
      : "/admin";
  redirect(`/login?next=${encodeURIComponent(safeNext)}`);
}
