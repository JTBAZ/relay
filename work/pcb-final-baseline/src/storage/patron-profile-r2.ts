/**
 * @fileoverview R2 object keys for patron profile avatar/banner uploads (account-scoped, not creator media).
 */

import {
  getAllowedMimePrefixesFromEnv,
  isMimeTypeAllowed,
} from "./relay-upload-r2.js";

export const PATRON_PROFILE_ASSET_KINDS = ["avatar", "banner"] as const;
export type PatronProfileAssetKind = (typeof PATRON_PROFILE_ASSET_KINDS)[number];

const DEFAULT_PATRON_PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MiB
const PATRON_PROFILE_IMAGE_MIME_PREFIXES = ["image/"];

/** Canonical object key: `relay/patrons/{accountId}/profile/{kind}/{assetId}/asset`. */
export function buildPatronProfileR2ObjectKey(
  accountId: string,
  kind: PatronProfileAssetKind,
  assetId: string
): string {
  return `relay/patrons/${accountId}/profile/${kind}/${assetId}/asset`;
}

export function isPatronProfileAssetKind(value: string): value is PatronProfileAssetKind {
  return (PATRON_PROFILE_ASSET_KINDS as readonly string[]).includes(value);
}

export function getPatronProfileImageMaxBytes(): number {
  const raw = process.env.RELAY_PATRON_PROFILE_IMAGE_MAX_BYTES?.trim();
  if (!raw) return DEFAULT_PATRON_PROFILE_IMAGE_MAX_BYTES;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PATRON_PROFILE_IMAGE_MAX_BYTES;
}

export function isPatronProfileImageMimeAllowed(contentType: string): boolean {
  return isMimeTypeAllowed(contentType, PATRON_PROFILE_IMAGE_MIME_PREFIXES);
}

/** Re-export for tests that compare against global upload allowlist. */
export function patronProfileUsesStricterMimeThanRelayUpload(): string[] {
  void getAllowedMimePrefixesFromEnv();
  return PATRON_PROFILE_IMAGE_MIME_PREFIXES;
}
