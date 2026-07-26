/**
 * @fileoverview Salted SHA-256 password helpers for legacy independent auth rows.
 * @description Not bcrypt/scrypt — existing format for `Account.passwordHash` compatibility in file/early DB.
 * @security-audit-required Password hashing upgrades belong in a dedicated auth migration.
 * @security-review 2026-06 [R-SEC-13 Medium] Salted SHA-256 is a fast hash (GPU-crackable if the DB
 *   leaks). Migrate verification to Argon2id/bcrypt/scrypt with rehash-on-login. See docs/security-review-2026-06.md.
 */

import { createHash, randomBytes } from "node:crypto";

/**
 * @description Produces `salt:hash` string for storage.
 * @param {string} plain
 * @returns {string}
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(salt + plain)
    .digest("hex");
  return `${salt}:${hash}`;
}

/**
 * @description Verifies plaintext against stored `salt:hash` format.
 * @param {string} plain
 * @param {string} stored
 * @returns {boolean}
 */
export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = createHash("sha256")
    .update(salt + plain)
    .digest("hex");
  return check === hash;
}
