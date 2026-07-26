/**
 * Escape Hatch EH-041 — Relay-managed Patreon verification service types.
 * Assertions use compact JWS with EdDSA (Ed25519). preview_only / not productionSafe.
 */

export const MANAGED_VERIFY_ALG = "EdDSA" as const;
export const DEFAULT_ASSERTION_TTL_SEC = 120;
/** Previous kid remains verifiable for this grace window after rotation. */
export const KEY_ROTATION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type ManagedVerifyKeyPair = {
  kid: string;
  publicKeyPem: string;
  privateKeyPem: string;
  createdAtMs: number;
  /** When set, key is retired from signing but still accepted for verify until grace ends. */
  retiredAtMs?: number;
};

export type ManagedVerifySiteRecord = {
  siteId: string;
  /** Exact callback origins allowed for return_url (no open redirects). */
  callbackOrigins: string[];
  audience: string;
  revoked: boolean;
  revokedAtMs?: number;
  /** Non-secret link metadata for migration export. */
  linkSubjects: Array<{
    patreonUserId: string;
    siteAccountId: string;
    linkedAtIso: string;
  }>;
  createdAtMs: number;
};

export type EntitlementObservation = {
  tierIds: string[];
  observedAtIso: string;
  patronStatus: string;
};

export type ManagedVerifyAssertionClaims = {
  iss: string;
  aud: string;
  sub: string;
  site_id: string;
  account_id: string;
  nonce: string;
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
  entitlement: {
    tier_ids: string[];
    observed_at: string;
    patron_status: string;
  };
};

export type ManagedVerifyJwks = {
  keys: Array<{
    kty: "OKP";
    crv: "Ed25519";
    kid: string;
    x: string;
    use: "sig";
    alg: typeof MANAGED_VERIFY_ALG;
  }>;
};

export type ManagedVerifyMetricsSnapshot = {
  assertionsIssued: number;
  assertionsVerifiedOk: number;
  assertionsRejected: number;
  providerFailures: number;
  tokenRefreshHooks: number;
  revocations: number;
};

export type ManagedVerifyHealth = {
  ok: boolean;
  enabled: boolean;
  productionSafe: false;
  detail: string;
  metrics: ManagedVerifyMetricsSnapshot;
};
