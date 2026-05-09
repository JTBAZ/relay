/**
 * @fileoverview Validates and maps HTTP payloads for `PostPresentation` upserts.
 * @see prisma/schema.prisma `PostPresentation`, `MediaAsset`
 * @see ./post-presentation-load.js Read path
 */

import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * @description Normalized PATCH body fragment for presentation handlers.
 */
export type PostPresentationUpsertPayload = {
  relayTitle?: string | null;
  relayDescription?: string | null;
  mediaOrder?: string[];
  tierPreviewSettings?: Prisma.InputJsonValue | null;
};

/**
 * @description Ensures every media id belongs to `creatorId` and is linked to `postId`.
 * @param prisma Prisma client.
 * @param creatorId Owning creator id.
 * @param postId Post id for linkage check.
 * @param mediaOrder Ordered media ids from client.
 * @returns Validation outcome.
 * @async
 * @throws Rejects on unexpected Prisma failures outside validation paths.
 * @security-audit-required Must only run after route proves session may mutate this creator/post pair.
 */
export async function validateMediaIdsBelongToPost(
  prisma: PrismaClient,
  creatorId: string,
  postId: string,
  mediaOrder: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const unique = [...new Set(mediaOrder.filter((x) => typeof x === "string" && x.length > 0))];
  if (unique.length === 0) {
    return { ok: true };
  }
  if (unique.length !== mediaOrder.length) {
    return { ok: false, message: "media_order must not contain duplicate ids." };
  }
  const assets = await prisma.mediaAsset.findMany({
    where: { creatorId, id: { in: unique } },
    select: { id: true, primaryPostId: true, postIds: true }
  });
  const byId = new Map(assets.map((a) => [a.id, a]));
  for (const id of unique) {
    const a = byId.get(id);
    if (!a) {
      return { ok: false, message: `media_id not found for this creator: ${id}` };
    }
    const linked = a.primaryPostId === postId || a.postIds.includes(postId);
    if (!linked) {
      return { ok: false, message: `media_id ${id} is not attached to this post.` };
    }
  }
  return { ok: true };
}

/**
 * @description Maps JSON body keys to Prisma-facing fragments; only keys in `touched` are considered present.
 * @param body Raw request body object.
 * @param touched Set of field names explicitly sent by client.
 * @returns Payload suitable for upsert.
 * @throws {Error} Validation tokens `VALIDATION:*` when shape invalid.
 */
export function derivePresentationUpsertFragments(
  body: Record<string, unknown>,
  touched: ReadonlySet<string>
): PostPresentationUpsertPayload {
  const out: PostPresentationUpsertPayload = {};
  if (touched.has("relay_title")) {
    const v = body.relay_title;
    if (v !== null && v !== undefined && typeof v !== "string") {
      throw new Error("VALIDATION:relay_title");
    }
    out.relayTitle = v === null || v === undefined || String(v).trim() === "" ? null : String(v);
  }
  if (touched.has("relay_description")) {
    const v = body.relay_description;
    if (v !== null && v !== undefined && typeof v !== "string") {
      throw new Error("VALIDATION:relay_description");
    }
    out.relayDescription = v === null || v === undefined ? null : String(v);
  }
  if (touched.has("media_order")) {
    const mo = body.media_order;
    if (!Array.isArray(mo)) {
      throw new Error("VALIDATION:media_order");
    }
    for (const x of mo) {
      if (typeof x !== "string" || x.trim().length === 0) {
        throw new Error("VALIDATION:media_order");
      }
    }
    const order = mo as string[];
    if (new Set(order).size !== order.length) {
      throw new Error("VALIDATION:media_order_dupes");
    }
    out.mediaOrder = order;
  }
  if (touched.has("tier_preview_settings")) {
    const v = body.tier_preview_settings;
    if (v === undefined) {
      throw new Error("VALIDATION:tier_preview_settings");
    }
    if (v === null) {
      out.tierPreviewSettings = null;
    } else {
      try {
        JSON.stringify(v);
      } catch {
        throw new Error("VALIDATION:tier_preview_settings");
      }
      out.tierPreviewSettings = v as Prisma.InputJsonValue;
    }
  }
  return out;
}

/**
 * @description Detects which presentation patch keys appear on `body` via `hasOwnProperty`.
 * @param body Raw body object.
 * @returns Set of touched canonical keys.
 */
export function presentationPatchTouches(body: Record<string, unknown>): Set<string> {
  const keys = [
    "relay_title",
    "relay_description",
    "media_order",
    "tier_preview_settings"
  ] as const;
  const touched = new Set<string>();
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      touched.add(k);
    }
  }
  return touched;
}
