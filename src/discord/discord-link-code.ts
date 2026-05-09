/**
 * @fileoverview Human-readable Discord channel link codes hashed for `DiscordLinkToken` storage.
 * @description Helpers for normalization, minting ephemeral codes, and SHA-256 hashes (never persist plaintext codes).
 */

import { createHash, randomBytes } from "node:crypto";

/**
 * Default 15 minutes (mint window + Discord entry time).
 * @description TTL constant for Discord link token UX.
 */
export const DISCORD_LINK_CODE_TTL_MS = 15 * 60 * 1000;

/**
 * Trim and uppercase so pasted codes are forgiving.
 * @description Normalizes user-entered link codes prior to hashing.
 * @param raw Raw code input.
 */
export function normalizeDiscordLinkCodeInput(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

/**
 * Human-transcribable one-time code (shown once to the creator).
 * @description Generates `RELAY-` prefixed random suffix for manual Discord entry.
 */
export function generateDiscordLinkPlainCode(): string {
  const suffix = randomBytes(5).toString("hex").slice(0, 10).toUpperCase();
  return `RELAY-${suffix}`;
}

/**
 * Stored in `DiscordLinkToken.codeHash` — never persist plaintext.
 * @description Deterministic SHA-256 digest for lookup rows.
 * @param normalizedUpper Output of {@link normalizeDiscordLinkCodeInput}.
 */
export function hashDiscordLinkCode(normalizedUpper: string): string {
  return createHash("sha256").update(`v1:${normalizedUpper}`, "utf8").digest("hex");
}
