import { createHash, randomBytes } from "node:crypto";

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(salt + plain)
    .digest("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = createHash("sha256")
    .update(salt + plain)
    .digest("hex");
  return check === hash;
}
