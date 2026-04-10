import { createHash } from "node:crypto";

/** SHA-256 hex of the opaque session string — stored in DB instead of raw tokens (operations-and-security.md). */
export function hashOpaqueSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
