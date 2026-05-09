/**
 * @fileoverview AES-256-GCM helpers for encrypting Patreon tokens and other secrets at rest.
 * @description Key material comes from `RELAY_TOKEN_ENCRYPTION_KEY` (base64, 32 bytes decoded).
 * @see src/auth/token-store-db.ts Consumers persisting encrypted credentials
 * @security-audit-required Cryptographic boundary; key rotation and ciphertext validation are operator concerns.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * @description Symmetric cipher identifier for token blobs.
 * @const {string} ALGORITHM
 */
const ALGORITHM = "aes-256-gcm";
/**
 * @description IV length for GCM (96-bit nonce).
 * @const {number} IV_LENGTH_BYTES
 */
const IV_LENGTH_BYTES = 12;

/**
 * @description Encrypts and decrypts UTF-8 strings using relay's static AES-GCM key.
 */
export class TokenEncryption {
  private readonly key: Buffer;

  /**
   * @description Decodes base64 key material; validates length for AES-256.
   * @param {string} base64Key `RELAY_TOKEN_ENCRYPTION_KEY` value.
   * @throws {Error} When decoded key is not exactly 32 bytes.
   */
  public constructor(base64Key: string) {
    const decoded = Buffer.from(base64Key, "base64");
    if (decoded.byteLength !== 32) {
      throw new Error("RELAY_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
    }
    this.key = decoded;
  }

  /**
   * @description Encrypts plaintext to base64 bundle `(iv || tag || ciphertext)`.
   * @param {string} plaintext UTF-8 cleartext (e.g. OAuth access token).
   * @returns {string} Base64-encoded packed buffer.
   * @throws {Error} When Node crypto fails (e.g. invalid state); rare for GCM with fresh IV.
   */
  public encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

  /**
   * @description Decrypts a value produced by {@link TokenEncryption#encrypt}.
   * @param {string} ciphertext Base64 packed blob.
   * @returns {string} Original UTF-8 plaintext.
   * @throws {Error} On auth tag mismatch, corrupt payload, or wrong key material.
   */
  public decrypt(ciphertext: string): string {
    const packed = Buffer.from(ciphertext, "base64");
    const iv = packed.subarray(0, IV_LENGTH_BYTES);
    const authTag = packed.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + 16);
    const encrypted = packed.subarray(IV_LENGTH_BYTES + 16);

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  }
}
