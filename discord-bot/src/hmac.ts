import { createHmac } from "node:crypto";

/** Hex digest matching `src/discord/discord-ingest-hmac.ts` on the Relay API. */
export function relayDiscordSignatureHex(bodyUtf8: string, secret: string): string {
  return createHmac("sha256", secret).update(bodyUtf8, "utf8").digest("hex");
}

/** Value for `X-Relay-Discord-Signature` (prefix `sha256=`). */
export function relayDiscordSignatureHeader(bodyUtf8: string, secret: string): string {
  return `sha256=${relayDiscordSignatureHex(bodyUtf8, secret)}`;
}
