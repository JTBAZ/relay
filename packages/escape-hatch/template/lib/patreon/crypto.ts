/**
 * AES-256-GCM encryption for Patreon refresh tokens at rest (EH-040).
 * Creator-owned key via ESCAPE_HATCH_PATREON_TOKEN_KEY (base64 or hex, 32 bytes).
 * Never log plaintext tokens.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

export class PatreonTokenEncryptionError extends Error {
  readonly code = "ESCAPE_HATCH_PATREON_TOKEN_CRYPTO";

  constructor(message: string) {
    super(message);
    this.name = "PatreonTokenEncryptionError";
  }
}

/**
 * Decode a creator-owned key from base64 or hex into exactly 32 bytes.
 */
export function decodePatreonTokenKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new PatreonTokenEncryptionError(
      "ESCAPE_HATCH_PATREON_TOKEN_KEY is empty."
    );
  }

  // Prefer hex when the string looks like hex of sufficient length.
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === KEY_BYTES * 2) {
    const hexKey = Buffer.from(trimmed, "hex");
    if (hexKey.byteLength === KEY_BYTES) return hexKey;
  }

  const b64 = Buffer.from(trimmed, "base64");
  if (b64.byteLength === KEY_BYTES) return b64;

  // Accept longer material by hashing? No — fail closed for wrong length.
  throw new PatreonTokenEncryptionError(
    "ESCAPE_HATCH_PATREON_TOKEN_KEY must decode to exactly 32 bytes (base64 or 64-char hex)."
  );
}

export class PatreonTokenEncryption {
  private readonly key: Buffer;

  constructor(keyMaterial: string | Buffer) {
    this.key =
      typeof keyMaterial === "string"
        ? decodePatreonTokenKey(keyMaterial)
        : keyMaterial;
    if (this.key.byteLength !== KEY_BYTES) {
      throw new PatreonTokenEncryptionError(
        "Patreon token encryption key must be 32 bytes."
      );
    }
  }

  /** Encrypt UTF-8 plaintext → base64(iv || tag || ciphertext). */
  encrypt(plaintext: string): string {
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      throw new PatreonTokenEncryptionError("Cannot encrypt empty token.");
    }
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  /** Decrypt a value produced by {@link encrypt}. */
  decrypt(ciphertext: string): string {
    if (typeof ciphertext !== "string" || ciphertext.length === 0) {
      throw new PatreonTokenEncryptionError("Cannot decrypt empty ciphertext.");
    }
    const packed = Buffer.from(ciphertext, "base64");
    if (packed.byteLength < IV_LENGTH_BYTES + AUTH_TAG_BYTES + 1) {
      throw new PatreonTokenEncryptionError("Ciphertext too short.");
    }
    const iv = packed.subarray(0, IV_LENGTH_BYTES);
    const authTag = packed.subarray(
      IV_LENGTH_BYTES,
      IV_LENGTH_BYTES + AUTH_TAG_BYTES
    );
    const encrypted = packed.subarray(IV_LENGTH_BYTES + AUTH_TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  }
}
