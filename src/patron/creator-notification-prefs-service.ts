/**
 * Creator notification preferences — default enabled when no row exists (v1).
 *
 * Patron prefs live in `notification_preferences`; creator studio alerts use account-scoped
 * toggles here so we do not fake a patron membership for the studio owner.
 */

import type { PrismaClient } from "@prisma/client";

export async function isCreatorPreferenceEnabled(
  _prisma: PrismaClient,
  _args: { accountId: string; preferenceType: string }
): Promise<boolean> {
  // v1: no creator prefs table yet — all creator social alerts are enabled by default.
  void _prisma;
  void _args;
  return true;
}
