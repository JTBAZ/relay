/**
 * @fileoverview Time-limited resubscribe URLs for migration campaigns (`lnk_*` tokens).
 * @description Pure URL builder; persistence lives in `MigrationStore.storeSignedLink`.
 * @see ./types.js
 */

import { randomUUID } from "node:crypto";
import type { SignedLink } from "./types.js";

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {string} memberId
 * @param {string} tierId
 * @param {string} baseUrl Public site origin (trailing slashes stripped).
 * @returns {import("./types.js").SignedLink}
 */
export function generateSignedLink(
  campaignId: string,
  memberId: string,
  tierId: string,
  baseUrl: string
): SignedLink {
  const token = `lnk_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();
  return {
    member_id: memberId,
    tier_id: tierId,
    token,
    url: `${baseUrl.replace(/\/+$/, "")}/migrate/resubscribe?token=${encodeURIComponent(token)}&campaign=${encodeURIComponent(campaignId)}`,
    expires_at: expiresAt
  };
}
