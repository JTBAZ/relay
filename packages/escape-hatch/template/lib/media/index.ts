/**
 * Private media delivery (EH-033).
 * Server-only for delivery/signing — visitor-src helpers are client-safe.
 */

export type {
  MediaDeliveryDenied,
  MediaDeliveryOk,
  MediaDeliveryResult,
  MediaLookup,
  MediaMode,
  MediaSigner,
  SignedGetResult
} from "./types";

export {
  DEFAULT_SIGNED_URL_TTL_SEC,
  MAX_SIGNED_URL_TTL_SEC,
  PRIVATE_NO_STORE,
  SOFT_PERSONA_COOKIE
} from "./types";

export {
  assertSafeMediaId,
  buildEscapeHatchMediaObjectKey,
  isEscapeHatchMediaObjectKey
} from "./keys";

export {
  isPremiumAccessLevel,
  resolveVisitorMediaSrc,
  visitorMediaApiPath
} from "./visitor-src";

export {
  MediaConfigError,
  assertPrivateR2Ready,
  isPrivateMediaMode,
  isR2SigningConfigured,
  loadR2SigningEnv,
  resolveMediaMode,
  resolveMediaModeSafe,
  resolveSignedUrlTtlSec
} from "./config";

export {
  createMediaSignerFromEnv,
  createMockMediaSigner,
  createR2MediaSigner
} from "./sign";

export {
  allowedSignedRedirectHosts,
  isSafeSignedRedirectUrl
} from "./redirect-guard";

export { lookupMediaInSite } from "./lookup";
export type { MediaSiteBundle } from "./lookup";

export type { DeliverMediaSite } from "./delivery";

export {
  PRIVATE_MEDIA_DIR_SEGMENTS,
  privateMediaRoot,
  readLocalPrivateMedia
} from "./local-store";

export { deliverMedia } from "./delivery";
export type { DeliverMediaInput } from "./delivery";
