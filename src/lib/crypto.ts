import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

export class TokenEncryption {
  private readonly key: Buffer;

  public constructor(base64Key: string) {
    const decoded = Buffer.from(base64Key, "base64");
    if (decoded.byteLength !== 32) {
      throw new Error("RELAY_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.");
    }
    this.key = decoded;
  }

  public encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]).toString("base64");
  }

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
