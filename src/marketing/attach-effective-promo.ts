/**
 * Helpers to attach patron-safe effective_promo onto visitor/simulator payloads.
 */

import type { PrismaClient } from "@prisma/client";
import { evaluatePostPermission } from "../gallery/post-permission.js";
import type { CanonicalSnapshot } from "../ingest/canonical-store.js";
import type { SessionToken } from "../identity/types.js";
import type { PostVisibility } from "../gallery/types.js";
import type { EffectivePromoDto } from "./effective-marketing-offer.js";
import { loadEffectivePromoForViewer } from "./load-effective-promo.js";

export function audienceKeysForSession(session: SessionToken | null): string[] {
  if (!session) return ["anonymous"];
  const tiers = (session.tier_ids ?? []).map((t) => t.trim()).filter(Boolean);
  if (tiers.length === 0) return ["anonymous"];
  return tiers.map((t) => `tier:${t}`);
}

export async function resolveViewerEffectivePromo(args: {
  prisma: PrismaClient;
  snapshot: CanonicalSnapshot;
  creatorId: string;
  postId: string;
  session: SessionToken | null;
  relayPostVisibility?: PostVisibility | null;
  isPostMature?: boolean;
  isContentOwner?: boolean;
}): Promise<EffectivePromoDto | null> {
  const perm = evaluatePostPermission({
    snapshot: args.snapshot,
    creatorId: args.creatorId,
    postId: args.postId,
    session: args.session,
    isContentOwner: args.isContentOwner === true,
    relayPostVisibility: args.relayPostVisibility ?? null,
    isPostMature: args.isPostMature === true,
    hideMatureContent: false
  });
  if (!perm) return null;
  if (args.relayPostVisibility === "hidden") {
    return null;
  }
  if (perm.outcome === "allow") return null;

  const post = args.snapshot.posts[args.creatorId]?.[args.postId];
  if (!post) return null;
  const tierMap = args.snapshot.tiers[args.creatorId] ?? {};
  const catalogTiers = Object.values(tierMap).map((t) => ({
    relay_tier_id: t.tier_id,
    amount_cents: typeof t.amount_cents === "number" ? t.amount_cents : null
  }));

  const keys = audienceKeysForSession(args.session);
  // Try first key via loader; loader uses single key — pass first, then re-resolve if needed.
  // Prefer multi-key via loadEffectivePromoForViewer extension:
  return loadEffectivePromoForViewer({
    prisma: args.prisma,
    creatorId: args.creatorId,
    postId: args.postId,
    audienceKey: keys[0] ?? "anonymous",
    audienceKeys: keys,
    permissionOutcome: perm.outcome,
    postTierIds: post.current.tier_ids,
    catalogTiers
  });
}
