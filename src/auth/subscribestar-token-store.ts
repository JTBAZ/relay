/**
 * Persisted-plaintext OAuth envelope for SubscribeStar creators (same shape as Patreon ingest tokens).
 */

import type {
  CredentialHealthStatus,
  PersistedPatreonTokens
} from "./token-store.js";

export type SubscribeStarCreatorPersistedTokens = PersistedPatreonTokens;

/**
 * SubscribeStar creator-ingest OAuth store (mirror `PatreonTokenStore` semantics).
 */
export interface SubscribeStarCreatorTokenStore {
  upsert(tokens: SubscribeStarCreatorPersistedTokens): Promise<void>;
  getByCreatorId(creatorId: string): Promise<SubscribeStarCreatorPersistedTokens | null>;
  listCreatorIds(): Promise<string[]>;
}

/** @hidden Re-export for callers that reuse health typing. */
export type { CredentialHealthStatus };
