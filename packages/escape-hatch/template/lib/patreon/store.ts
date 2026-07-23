/**
 * In-memory / injectable Patreon link + credential store (EH-040).
 * Production kits persist via SQL (0005_*); tests use memory.
 * Never stores plaintext refresh tokens — only ciphertext.
 */

import { computeDefaultStaleAfter } from "../entitlements/freshness";
import type { EntitlementSnapshot } from "../identity/types";

export type PatreonIdentityLinkRecord = {
  siteId: string;
  authUserId: string;
  patreonUserId: string;
  linkedAt: string;
  lastValidatedAt: string;
};

export type PatreonCredentialRecord = {
  siteId: string;
  authUserId: string;
  patreonUserId: string;
  encryptedRefreshToken: string;
  accessTokenExpiresAt: string | null;
  scopes: string | null;
  updatedAt: string;
};

export type PatreonLinkStore = {
  upsertLink(record: PatreonIdentityLinkRecord): Promise<void>;
  getLinkByUser(
    siteId: string,
    authUserId: string
  ): Promise<PatreonIdentityLinkRecord | null>;
  getLinkByPatreonUser(
    siteId: string,
    patreonUserId: string
  ): Promise<PatreonIdentityLinkRecord | null>;
  upsertCredential(record: PatreonCredentialRecord): Promise<void>;
  getCredential(
    siteId: string,
    authUserId: string
  ): Promise<PatreonCredentialRecord | null>;
  upsertEntitlementSnapshot(snapshot: EntitlementSnapshot): Promise<void>;
  getEntitlementSnapshot(
    siteId: string,
    authUserId: string
  ): Promise<EntitlementSnapshot | null>;
};

export function createMemoryPatreonLinkStore(): PatreonLinkStore {
  const links = new Map<string, PatreonIdentityLinkRecord>();
  const creds = new Map<string, PatreonCredentialRecord>();
  const snaps = new Map<string, EntitlementSnapshot>();
  const patreonIndex = new Map<string, string>();

  const linkKey = (siteId: string, authUserId: string) =>
    `${siteId}::${authUserId}`;
  const patreonKey = (siteId: string, patreonUserId: string) =>
    `${siteId}::p::${patreonUserId}`;

  return {
    async upsertLink(record) {
      links.set(linkKey(record.siteId, record.authUserId), { ...record });
      patreonIndex.set(
        patreonKey(record.siteId, record.patreonUserId),
        record.authUserId
      );
    },
    async getLinkByUser(siteId, authUserId) {
      return links.get(linkKey(siteId, authUserId)) ?? null;
    },
    async getLinkByPatreonUser(siteId, patreonUserId) {
      const uid = patreonIndex.get(patreonKey(siteId, patreonUserId));
      if (!uid) return null;
      return links.get(linkKey(siteId, uid)) ?? null;
    },
    async upsertCredential(record) {
      creds.set(linkKey(record.siteId, record.authUserId), { ...record });
    },
    async getCredential(siteId, authUserId) {
      return creds.get(linkKey(siteId, authUserId)) ?? null;
    },
    async upsertEntitlementSnapshot(snapshot) {
      snaps.set(linkKey(snapshot.siteId, snapshot.authUserId), {
        ...snapshot,
        tierIds: [...snapshot.tierIds]
      });
    },
    async getEntitlementSnapshot(siteId, authUserId) {
      const s = snaps.get(linkKey(siteId, authUserId));
      return s ? { ...s, tierIds: [...s.tierIds] } : null;
    }
  };
}

/** Build a patreon-sourced entitlement snapshot for upsert. */
export function buildPatreonEntitlementSnapshot(args: {
  siteId: string;
  authUserId: string;
  tierIds: readonly string[];
  observedAt?: string;
  reason?: string;
}): EntitlementSnapshot {
  const observedAt = args.observedAt ?? new Date().toISOString();
  const staleAfter = computeDefaultStaleAfter("patreon", observedAt);
  return {
    siteId: args.siteId,
    authUserId: args.authUserId,
    tierIds: [...args.tierIds],
    source: "patreon",
    reason:
      args.reason ??
      "Patreon OAuth link validated against configured campaign.",
    observedAt,
    staleAfter,
    expiresAt: null,
    revokedAt: null
  };
}
