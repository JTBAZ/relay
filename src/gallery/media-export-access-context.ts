/**
 * @fileoverview Resolve session/account scope for export media byte delivery (`/content`, `/thumb`).
 */

import type { PrismaClient } from "@prisma/client";
import { accountOwnsRelayCreatorId } from "../identity/account-creator-ownership.js";
import { getAccountIdForSession } from "../identity/patron-auth-context.js";
import type { SessionToken } from "../identity/types.js";

export type MediaExportAccessContext = {
  accountId: string | null;
  isContentOwner: boolean;
  isExtensionGrant: boolean;
};

/**
 * Resolves whether the bearer session belongs to the studio that owns `creatorId`.
 * Extension grants use the same account binding as web sessions; cross-post media fetches
 * must treat the owning creator as authoritative and skip patron tier/mature gates.
 */
export async function resolveMediaExportAccessContext(
  prisma: PrismaClient | undefined,
  session: SessionToken | null,
  creatorId: string
): Promise<MediaExportAccessContext> {
  if (!prisma || !session) {
    return { accountId: null, isContentOwner: false, isExtensionGrant: false };
  }

  const accountId = await getAccountIdForSession(prisma, session);
  if (!accountId) {
    return {
      accountId: null,
      isContentOwner: false,
      isExtensionGrant: session.kind === "extension"
    };
  }

  const isContentOwner = await accountOwnsRelayCreatorId(prisma, accountId, creatorId);
  return {
    accountId,
    isContentOwner,
    isExtensionGrant: session.kind === "extension"
  };
}

/** Content owners (including extension handoff grants) skip patron entitlement gates. */
export function shouldApplyMediaExportEntitlementGates(args: {
  session: SessionToken | null;
  exportRequireTierAccess: boolean;
  isContentOwner: boolean;
}): boolean {
  if (args.isContentOwner) {
    return false;
  }
  return Boolean(args.session) || args.exportRequireTierAccess;
}
