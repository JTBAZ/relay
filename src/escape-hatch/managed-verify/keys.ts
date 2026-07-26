/**
 * Ed25519 keyring with overlapping verification for rotation (EH-041).
 */

import { generateKeyPairSync, createPublicKey } from "node:crypto";
import {
  KEY_ROTATION_GRACE_MS,
  MANAGED_VERIFY_ALG,
  type ManagedVerifyJwks,
  type ManagedVerifyKeyPair
} from "./types.js";

function mintKid(): string {
  return `eh041_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateManagedVerifyKeyPair(
  nowMs = Date.now()
): ManagedVerifyKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    kid: mintKid(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    createdAtMs: nowMs
  };
}

export type ManagedVerifyKeyRing = {
  /** Active signing key (newest non-retired, or last active). */
  getActiveSigningKey(): ManagedVerifyKeyPair;
  /** Keys still valid for verification (active + grace). */
  listVerificationKeys(nowMs?: number): ManagedVerifyKeyPair[];
  rotate(nowMs?: number): ManagedVerifyKeyPair;
  toJwks(nowMs?: number): ManagedVerifyJwks;
  /** Import a pre-built key (tests). */
  importKey(pair: ManagedVerifyKeyPair): void;
};

/**
 * In-memory keyring. Production would persist PEM material in a secret store.
 */
export function createManagedVerifyKeyRing(
  initial?: ManagedVerifyKeyPair
): ManagedVerifyKeyRing {
  const keys: ManagedVerifyKeyPair[] = [];
  if (initial) keys.push({ ...initial });
  else keys.push(generateManagedVerifyKeyPair());

  return {
    getActiveSigningKey() {
      const active = keys.filter((k) => k.retiredAtMs === undefined);
      const pick = active[active.length - 1] ?? keys[keys.length - 1];
      if (!pick) throw new Error("managed_verify_no_signing_key");
      return pick;
    },
    listVerificationKeys(nowMs = Date.now()) {
      return keys.filter((k) => {
        if (k.retiredAtMs === undefined) return true;
        return nowMs - k.retiredAtMs <= KEY_ROTATION_GRACE_MS;
      });
    },
    rotate(nowMs = Date.now()) {
      for (const k of keys) {
        if (k.retiredAtMs === undefined) k.retiredAtMs = nowMs;
      }
      const next = generateManagedVerifyKeyPair(nowMs);
      keys.push(next);
      return next;
    },
    toJwks(nowMs = Date.now()) {
      const out: ManagedVerifyJwks = { keys: [] };
      for (const k of this.listVerificationKeys(nowMs)) {
        const spki = createPublicKey(k.publicKeyPem);
        const raw = spki.export({ type: "spki", format: "der" }) as Buffer;
        // SPKI for Ed25519 ends with 32-byte raw public key.
        const x = raw.subarray(raw.length - 32).toString("base64url");
        out.keys.push({
          kty: "OKP",
          crv: "Ed25519",
          kid: k.kid,
          x,
          use: "sig",
          alg: MANAGED_VERIFY_ALG
        });
      }
      return out;
    },
    importKey(pair) {
      keys.push({ ...pair });
    }
  };
}
