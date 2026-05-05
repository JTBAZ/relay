import { createHash, randomBytes } from "node:crypto";

/** Default 15 minutes (mint window + Discord entry time). */
export const DISCORD_LINK_CODE_TTL_MS = 15 * 60 * 1000;

/** Trim and uppercase so pasted codes are forgiving. */
export function normalizeDiscordLinkCodeInput(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

/** Human-transcribable one-time code (shown once to the creator). */
export function generateDiscordLinkPlainCode(): string {
  const suffix = randomBytes(5).toString("hex").slice(0, 10).toUpperCase();
  return `RELAY-${suffix}`;
}

/** Stored in `DiscordLinkToken.codeHash` — never persist plaintext. */
export function hashDiscordLinkCode(normalizedUpper: string): string {
  return createHash("sha256").update(`v1:${normalizedUpper}`, "utf8").digest("hex");
}
