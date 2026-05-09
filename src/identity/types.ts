/**
 * @fileoverview Legacy and DB-mapped identity shapes for opaque sessions and file-backed `identity.json`.
 * @description Aligns with Prisma `Account` / `TenantMembership` / `Session` when `RELAY_DB_STORE_IDENTITY` is enabled. See {@link src/jsdoc-core-entities.ts} for domain-level `Artist` / tenant concepts.
 * @see src/jsdoc-core-entities.ts
 */

/**
 * @description Authentication source for an account row: independent (email/password or Supabase-linked) vs Patreon-linked.
 */
export type AuthProvider = "independent" | "patreon";

/**
 * @description Opaque session channel: browser web session vs extension grant (`SessionKind` in Prisma).
 */
export type SessionKindTs = "web" | "extension";

/**
 * @description Patron-facing user projection: maps a `TenantMembership` + `Account` into the API shape used by `IdentityService` and cookies.
 * @see src/jsdoc-core-entities.ts
 */
export type UserAccount = {
  user_id: string;
  creator_id: string;
  email: string;
  password_hash: string;
  auth_provider: AuthProvider;
  patreon_user_id?: string;
  tier_ids: string[];
  created_at: string;
  updated_at: string;
};

/**
 * @description Opaque Bearer/cookie session payload after resolution; `token` is the raw secret (never store verbatim in DB — use {@link "./session-token-hash.js"}).
 */
export type SessionToken = {
  token: string;
  user_id: string;
  creator_id: string;
  tier_ids: string[];
  expires_at: string;
  kind?: SessionKindTs;
  label?: string | null;
  last_used_at?: string | null;
};

/**
 * @description File-backed root document for `FileIdentityStore` (`users` keyed by membership id, `sessions` keyed by token).
 */
export type IdentityStoreRoot = {
  users: Record<string, UserAccount>;
  sessions: Record<string, SessionToken>;
};
