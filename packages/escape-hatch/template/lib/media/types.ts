/**
 * Private media delivery contracts (EH-033).
 * Server-enforced access — never authorize premium bytes from the client.
 */

export type MediaMode = "public_legacy" | "private_r2" | "local_private";

export type MediaLookup = {
  mediaId: string;
  siteId: string;
  creatorId: string;
  postId: string;
  accessLevel: "public" | "member_only" | "tier_gated";
  tierIds: readonly string[];
  matchMode?: "exact" | "tier_or_higher";
  /** Original static path (may still exist for public assets). */
  contentPath: string;
  /** Opaque private object key when migrated / private layout. */
  objectKey: string;
};

export type SignedGetResult = {
  url: string;
  expiresAt: string;
  ttlSec: number;
};

export type MediaSigner = {
  readonly implementation: "mock" | "r2";
  signGetObject(key: string, ttlSec?: number): Promise<SignedGetResult>;
};

export type MediaDeliveryOk =
  | {
      ok: true;
      kind: "redirect";
      url: string;
      expiresAt: string;
      cacheControl: string;
      reason: string;
    }
  | {
      ok: true;
      kind: "stream";
      body: Buffer;
      contentType: string;
      cacheControl: string;
      reason: string;
    }
  | {
      ok: true;
      kind: "public_path";
      path: string;
      cacheControl: string;
      reason: string;
    };

export type MediaDeliveryDenied = {
  ok: false;
  status: 400 | 401 | 403 | 404 | 503;
  reason: string;
  detail: string;
};

export type MediaDeliveryResult = MediaDeliveryOk | MediaDeliveryDenied;

/** Soft persona cookie — persona **id** only; tiers resolved server-side from bundle. */
export const SOFT_PERSONA_COOKIE = "eh_soft_persona";

/** Default signed GET TTL (seconds). Keep short; never embed in client bundles. */
export const DEFAULT_SIGNED_URL_TTL_SEC = 60;

/** Max allowed TTL for signed GETs. */
export const MAX_SIGNED_URL_TTL_SEC = 300;

export const PRIVATE_NO_STORE = "private, no-store";
