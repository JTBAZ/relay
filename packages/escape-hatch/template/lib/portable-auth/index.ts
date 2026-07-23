/**
 * Portable auth public surface (EH-031 / Path B).
 */

export {
  hashPassword,
  verifyPassword,
  mintSessionToken,
  hashSessionToken,
  PORTABLE_SESSION_COOKIE,
  PORTABLE_SESSION_TTL_MS,
  portableSessionCookieOptions
} from "./crypto";

export {
  withPortableClient,
  resolvePortableDatabaseUrl,
  resetPortablePoolForTests
} from "./db";

export {
  getPortableAuthSession,
  loadPortableMembershipRole,
  loadPortableEntitlementSnapshot,
  portableLogin,
  portableLogout,
  portableRevokeAllSessionsForUser,
  portableHashPasswordForBootstrap,
  portableSessionIsSiteStaff
} from "./session";
