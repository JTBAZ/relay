/**
 * @fileoverview Presigned R2 upload + public delivery for patron profile avatar/banner images.
 */

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { R2ClientConfig } from "../storage/r2-config.js";
import {
  buildPatronProfileR2ObjectKey,
  getPatronProfileImageMaxBytes,
  isPatronProfileAssetKind,
  isPatronProfileImageMimeAllowed,
  type PatronProfileAssetKind,
} from "../storage/patron-profile-r2.js";
import {
  getPresignExpiresSec,
  getR2ObjectBuffer,
  headR2ObjectContentLength,
  presignR2Put,
} from "../storage/relay-upload-r2.js";

export const PATRON_PROFILE_STATIC_ASSET_PREFIX = "/patron-profile/";

/** Relative API path (no origin) for a committed profile image. */
export function patronProfileAssetContentPath(
  accountId: string,
  kind: PatronProfileAssetKind,
  assetId: string
): string {
  return `/api/v1/public/patron-profile-assets/${encodeURIComponent(accountId)}/${kind}/${encodeURIComponent(assetId)}/content`;
}

export function parsePatronProfileAssetContentPath(
  url: string
): { accountId: string; kind: PatronProfileAssetKind; assetId: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  let pathname = trimmed;
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      pathname = new URL(trimmed).pathname;
    }
  } catch {
    return null;
  }
  const m = /^\/api\/v1\/public\/patron-profile-assets\/([^/]+)\/(avatar|banner)\/([^/]+)\/content$/.exec(
    pathname
  );
  if (!m) return null;
  const kind = m[2]!;
  if (!isPatronProfileAssetKind(kind)) return null;
  return {
    accountId: decodeURIComponent(m[1]!),
    kind,
    assetId: decodeURIComponent(m[3]!),
  };
}

/** Allowed on PatronProfile.avatarUrl / bannerUrl when patching. */
export function isAllowedPatronProfileImageUrl(
  url: string,
  accountId: string
): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(PATRON_PROFILE_STATIC_ASSET_PREFIX)) return true;
  const parsed = parsePatronProfileAssetContentPath(trimmed);
  return parsed !== null && parsed.accountId === accountId;
}

export async function initPatronProfileImageUpload(args: {
  accountId: string;
  kind: PatronProfileAssetKind;
  contentType: string;
  byteSize: number;
  r2: R2ClientConfig;
}): Promise<
  | {
      ok: true;
      asset_id: string;
      storage_key: string;
      upload: { method: "PUT"; url: string; headers: { "Content-Type": string } };
      expires_in_sec: number;
    }
  | { ok: false; code: "VALIDATION_ERROR"; message: string }
> {
  if (!isPatronProfileImageMimeAllowed(args.contentType)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "content_type must be an image/* MIME type.",
    };
  }
  const max = getPatronProfileImageMaxBytes();
  if (args.byteSize <= 0 || args.byteSize > max) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `byte_size must be between 1 and ${max}.`,
    };
  }
  const assetId = `patron_pf_${randomUUID()}`;
  const key = buildPatronProfileR2ObjectKey(args.accountId, args.kind, assetId);
  const exp = getPresignExpiresSec();
  const uploadUrl = await presignR2Put(args.r2, key, args.contentType, exp);
  return {
    ok: true,
    asset_id: assetId,
    storage_key: key,
    upload: {
      method: "PUT",
      url: uploadUrl,
      headers: { "Content-Type": args.contentType },
    },
    expires_in_sec: exp,
  };
}

export async function commitPatronProfileImageUpload(args: {
  accountId: string;
  kind: PatronProfileAssetKind;
  assetId: string;
  contentType: string;
  byteSize: number;
  r2: R2ClientConfig;
}): Promise<
  | { ok: true; asset_id: string; public_url_path: string; content_length: number }
  | { ok: false; code: "VALIDATION_ERROR" | "NOT_FOUND"; message: string }
> {
  if (!isPatronProfileImageMimeAllowed(args.contentType)) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "content_type must be an image/* MIME type.",
    };
  }
  const max = getPatronProfileImageMaxBytes();
  if (args.byteSize <= 0 || args.byteSize > max) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `byte_size must be between 1 and ${max}.`,
    };
  }
  const key = buildPatronProfileR2ObjectKey(args.accountId, args.kind, args.assetId);
  let head: { contentLength: number; contentType: string | undefined };
  try {
    head = await headR2ObjectContentLength(args.r2, key);
  } catch {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Upload not found in object storage. Complete the PUT before commit.",
    };
  }
  if (head.contentLength <= 0) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Upload is empty.",
    };
  }
  if (head.contentLength > max) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Uploaded object exceeds the profile image size limit.",
    };
  }
  const publicUrlPath = patronProfileAssetContentPath(args.accountId, args.kind, args.assetId);
  return {
    ok: true,
    asset_id: args.assetId,
    public_url_path: publicUrlPath,
    content_length: head.contentLength,
  };
}

export async function mayReadPatronProfileAsset(args: {
  prisma: PrismaClient;
  accountId: string;
  kind: PatronProfileAssetKind;
  assetId: string;
  sessionAccountId: string | null;
}): Promise<boolean> {
  if (args.sessionAccountId && args.sessionAccountId === args.accountId) {
    return true;
  }
  const expectedPath = patronProfileAssetContentPath(args.accountId, args.kind, args.assetId);
  const profiles = await args.prisma.patronProfile.findMany({
    where: { tenantMembership: { accountId: args.accountId }, isPublic: true },
    select: { avatarUrl: true, bannerUrl: true },
  });
  return profiles.some((row) => {
    const field = args.kind === "avatar" ? row.avatarUrl : row.bannerUrl;
    if (!field) return false;
    return field.includes(expectedPath) || field.endsWith(expectedPath);
  });
}

export async function getPatronProfileAssetBytes(args: {
  r2: R2ClientConfig;
  accountId: string;
  kind: PatronProfileAssetKind;
  assetId: string;
}): Promise<{ buffer: Buffer; contentType: string } | null> {
  const key = buildPatronProfileR2ObjectKey(args.accountId, args.kind, args.assetId);
  try {
    const head = await headR2ObjectContentLength(args.r2, key);
    const buffer = await getR2ObjectBuffer(args.r2, key);
    return {
      buffer,
      contentType: head.contentType?.trim() || "application/octet-stream",
    };
  } catch {
    return null;
  }
}
