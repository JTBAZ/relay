/**
 * Entitlement-gated media delivery (EH-033).
 * evaluateAccess → signed URL redirect or local private stream.
 * Never returns storage secrets. Deny by default.
 */

import { evaluateCurrentAccess } from "../entitlements/server";
import { loadEnv } from "../env";
import {
  assertPrivateR2Ready,
  MediaConfigError,
  resolveMediaMode,
  resolveSignedUrlTtlSec
} from "./config";
import { lookupMediaInSite, type MediaSiteBundle } from "./lookup";
import { readLocalPrivateMedia } from "./local-store";
import { isSafeSignedRedirectUrl } from "./redirect-guard";
import { createMediaSignerFromEnv, createMockMediaSigner } from "./sign";
import type { MediaDeliveryResult, MediaSigner } from "./types";
import { PRIVATE_NO_STORE, SOFT_PERSONA_COOKIE } from "./types";
import { isPremiumAccessLevel } from "./visitor-src";

export type DeliverMediaSite = MediaSiteBundle & {
  tiers: ReadonlyArray<{
    tier_id: string;
    amount_cents?: number | null;
    title?: string;
    currency?: string;
  }>;
  demo_personas: ReadonlyArray<{
    id: string;
    tier_ids: readonly string[];
  }>;
};

export type DeliverMediaInput = {
  site: DeliverMediaSite;
  mediaId: string;
  /** Raw Cookie header (optional). Soft persona id only when provider none. */
  cookieHeader?: string | null;
  /** Injected signer for tests; production builds from env when private_r2. */
  signer?: MediaSigner;
  /** Working directory for local_private store (tests). */
  cwd?: string;
  nowMs?: number;
};

function buildTierCatalog(
  tiers: DeliverMediaSite["tiers"]
): Record<
  string,
  { amount_cents?: number | null; title?: string; currency?: string }
> {
  const out: Record<
    string,
    { amount_cents?: number | null; title?: string; currency?: string }
  > = {};
  for (const t of tiers) {
    out[t.tier_id] = {
      amount_cents: t.amount_cents,
      title: t.title,
      currency: t.currency
    };
  }
  return out;
}

function parseCookieValue(
  cookieHeader: string | null | undefined,
  name: string
): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

function softPersonaFromCookie(
  site: DeliverMediaSite,
  cookieHeader: string | null | undefined
): { personaId: string; tierIds: readonly string[] } | null {
  const personaId = parseCookieValue(cookieHeader, SOFT_PERSONA_COOKIE);
  if (!personaId) return null;
  const persona = site.demo_personas.find((p) => p.id === personaId);
  if (!persona) return null;
  return { personaId: persona.id, tierIds: persona.tier_ids };
}

/**
 * Deliver premium/public media after server entitlement evaluation.
 */
export async function deliverMedia(
  input: DeliverMediaInput
): Promise<MediaDeliveryResult> {
  const mediaId = input.mediaId?.trim();
  if (!mediaId) {
    return {
      ok: false,
      status: 400,
      reason: "missing_media_id",
      detail: "media id is required."
    };
  }

  const lookup = lookupMediaInSite(input.site, mediaId);
  if (!lookup) {
    return {
      ok: false,
      status: 404,
      reason: "unknown_media",
      detail: "Unknown media id."
    };
  }

  let mode;
  try {
    mode = resolveMediaMode(loadEnv());
  } catch (err) {
    return {
      ok: false,
      status: 503,
      reason: "media_mode_invalid",
      detail:
        err instanceof MediaConfigError
          ? err.message
          : "Invalid media mode configuration."
    };
  }

  const catalog =
    input.site.tiers.length > 0
      ? buildTierCatalog(input.site.tiers)
      : undefined;

  const softPersona = softPersonaFromCookie(input.site, input.cookieHeader);

  const evaluation = await evaluateCurrentAccess({
    siteId: lookup.siteId,
    softPersona,
    tierCatalog: catalog,
    nowMs: input.nowMs,
    resource: {
      type: "media",
      id: lookup.mediaId,
      siteId: lookup.siteId,
      accessLevel: lookup.accessLevel,
      tierIds: lookup.tierIds,
      matchMode: lookup.matchMode
    }
  });

  if (!evaluation.allowed) {
    const status =
      evaluation.reason === "anonymous_denied" ||
      evaluation.reason === "missing_credentials"
        ? 401
        : evaluation.reason === "unknown_resource"
          ? 404
          : 403;
    return {
      ok: false,
      status,
      reason: evaluation.reason,
      detail: evaluation.detail
    };
  }

  // Public assets may still be served from static public/media when present.
  if (!isPremiumAccessLevel(lookup.accessLevel) && mode === "public_legacy") {
    return {
      ok: true,
      kind: "public_path",
      path: lookup.contentPath.startsWith("/")
        ? lookup.contentPath
        : `/${lookup.contentPath}`,
      cacheControl: "public, max-age=300",
      reason: evaluation.reason
    };
  }

  // EH-082: public_legacy must not deliver premium bytes (static or private stream).
  if (mode === "public_legacy" && isPremiumAccessLevel(lookup.accessLevel)) {
    return {
      ok: false,
      status: 503,
      reason: "public_legacy_forbidden",
      detail:
        "ESCAPE_HATCH_MEDIA_MODE=public_legacy is blocked for premium delivery. Use local_private or private_r2."
    };
  }

  if (mode === "local_private") {
    const local = readLocalPrivateMedia(lookup.mediaId, input.cwd);
    if (!local) {
      // Public media may still live under public/media for free assets.
      if (!isPremiumAccessLevel(lookup.accessLevel)) {
        return {
          ok: true,
          kind: "public_path",
          path: lookup.contentPath.startsWith("/api/")
            ? `/media/${lookup.mediaId}.svg`
            : lookup.contentPath.startsWith("/")
              ? lookup.contentPath
              : `/${lookup.contentPath}`,
          cacheControl: "public, max-age=300",
          reason: evaluation.reason
        };
      }
      return {
        ok: false,
        status: 404,
        reason: "private_bytes_missing",
        detail:
          "Private media bytes are not present under data/private-media. Re-run fill with private layout or configure R2."
      };
    }
    return {
      ok: true,
      kind: "stream",
      body: local.body,
      contentType: local.contentType,
      cacheControl: PRIVATE_NO_STORE,
      reason: evaluation.reason
    };
  }

  // private_r2
  try {
    assertPrivateR2Ready(loadEnv());
  } catch (err) {
    return {
      ok: false,
      status: 503,
      reason: "r2_not_configured",
      detail:
        err instanceof MediaConfigError
          ? err.message
          : "Private R2 signing is not configured."
    };
  }

  const signer =
    input.signer ??
    (process.env.ESCAPE_HATCH_MEDIA_SIGNER === "mock"
      ? createMockMediaSigner({ ttlSec: resolveSignedUrlTtlSec() })
      : createMediaSignerFromEnv());

  let signed;
  try {
    signed = await signer.signGetObject(
      lookup.objectKey,
      resolveSignedUrlTtlSec()
    );
  } catch (err) {
    return {
      ok: false,
      status: 503,
      reason: "sign_failed",
      detail:
        err instanceof Error
          ? "Failed to mint signed media URL."
          : "Failed to mint signed media URL."
    };
  }

  if (!isSafeSignedRedirectUrl(signed.url, loadEnv())) {
    return {
      ok: false,
      status: 503,
      reason: "redirect_host_denied",
      detail: "Signed URL host is not allowlisted — refusing redirect."
    };
  }

  return {
    ok: true,
    kind: "redirect",
    url: signed.url,
    expiresAt: signed.expiresAt,
    cacheControl: PRIVATE_NO_STORE,
    reason: evaluation.reason
  };
}
