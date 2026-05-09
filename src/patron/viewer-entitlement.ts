/**
 * @fileoverview Patron experience module viewer-entitlement.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
/**
 * PE-D / D29 — viewer-aware entitlement re-check.
 *
 * Decides what the **current viewer** is entitled to see for a given source post, by combining:
 *   1. The post's required `tier_ids` (the gate).
 *   2. The viewer's current `PatronEntitlementSnapshot` for the source creator (the key).
 *
 * **Live re-check, not snapshot-freeze.** Earlier drafts of PE-D froze the access decision at
 * favorite/save time via a `snapshotTierId` field. That was reversed (D29) to encourage retention
 * — collected items now blur/lock if the viewer's tier lapses, and resume showing if the tier
 * comes back.
 *
 * The companion forensic columns `PatronFavorite.snapshotTierIds` /
 * `PatronSavedCollectionEntry.snapshotTierIds` are written at save time but **never** consulted
 * here. They are metadata only ("you had access via tier X when you saved this").
 *
 * Reserved enum values: 'preview' (free slice / future) and 'unlockable' (PE-L tip-to-unlock,
 * dormant). This module only emits 'visible' or 'locked' today; the API shape is forward-compatible.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  ViewerEntitlementDecision,
  ViewerEntitlementState
} from "../gallery/types.js";

export type ViewerEntitlementSourceTarget = {
  /** The creator who owns the source post being saved. */
  source_creator_id: string;
  /** The source post id whose tier requirements gate the view. */
  source_post_id: string;
};

export type ComputeViewerEntitlementArgs = ViewerEntitlementSourceTarget & {
  prisma: PrismaClient | Prisma.TransactionClient;
  /**
   * Viewer's `Account.id` (NOT a `TenantMembership.id`). When null, we treat the viewer as
   * "not a patron of this creator" and lock anything that requires a tier. Free posts stay visible.
   */
  viewer_account_id: string | null;
  now?: Date;
};

const FREE_POST: ViewerEntitlementDecision = Object.freeze({
  state: "visible",
  required_tier_ids: [],
  source: "free_post"
});

function lockedDecision(
  requiredTierIds: readonly string[],
  source: ViewerEntitlementDecision["source"]
): ViewerEntitlementDecision {
  return {
    state: "locked",
    required_tier_ids: [...requiredTierIds],
    source
  };
}

function visibleDecision(
  requiredTierIds: readonly string[]
): ViewerEntitlementDecision {
  return {
    state: "visible",
    required_tier_ids: [...requiredTierIds],
    source: "active_snapshot"
  };
}

/**
 * Single-target computation. Internally fetches the post + viewer's snapshot row.
 *
 * Time complexity: 2 indexed lookups per call. For listing endpoints prefer
 * {@link computeViewerEntitlementsForPostsBulk} which batches these.
 */
export async function computeViewerEntitlementForPost(
  args: ComputeViewerEntitlementArgs
): Promise<ViewerEntitlementDecision> {
  const post = await args.prisma.post.findFirst({
    where: { id: args.source_post_id, creatorId: args.source_creator_id },
    select: {
      isPublic: true,
      versions: {
        orderBy: { versionSeq: "desc" },
        take: 1,
        select: { tierIds: true }
      }
    }
  });
  if (!post) {
    return lockedDecision([], "missing_snapshot");
  }
  const requiredTierIds = post.versions[0]?.tierIds ?? [];
  if (post.isPublic || requiredTierIds.length === 0) {
    return FREE_POST;
  }

  if (!args.viewer_account_id) {
    return lockedDecision(requiredTierIds, "missing_snapshot");
  }

  const snap = await loadAccountSnapshotForCreator(
    args.prisma,
    args.viewer_account_id,
    args.source_creator_id
  );
  return decideFromSnapshot(snap, requiredTierIds);
}

/**
 * Bulk variant — used by list endpoints (favorites, collections). One DB round trip per
 * distinct dependency: posts, snapshots, viewer membership ids.
 *
 * Returns a Map keyed by `${source_creator_id}\0${source_post_id}` so callers can attach
 * the decision to each row without N+1 queries.
 */
export async function computeViewerEntitlementsForPostsBulk(args: {
  prisma: PrismaClient | Prisma.TransactionClient;
  viewer_account_id: string | null;
  targets: readonly ViewerEntitlementSourceTarget[];
  now?: Date;
}): Promise<Map<string, ViewerEntitlementDecision>> {
  const out = new Map<string, ViewerEntitlementDecision>();
  if (args.targets.length === 0) {
    return out;
  }

  // Deduplicate (creator, post) pairs to keep query payloads small.
  const uniqueTargets = new Map<string, ViewerEntitlementSourceTarget>();
  for (const t of args.targets) {
    uniqueTargets.set(targetKey(t), t);
  }

  // 1) Fetch posts in one query — include latest PostVersion to read its tier_ids (the canonical
  //    gate). `Post.requiredTierId` only encodes the single-tier RLS fast path; PostVersion is the
  //    source of truth for multi-tier gates and matches `assemblePatronFeed`.
  const creatorIds = [...new Set([...uniqueTargets.values()].map((t) => t.source_creator_id))];
  const postIds = [...new Set([...uniqueTargets.values()].map((t) => t.source_post_id))];
  const postRows = await args.prisma.post.findMany({
    where: { creatorId: { in: creatorIds }, id: { in: postIds } },
    select: {
      id: true,
      creatorId: true,
      isPublic: true,
      versions: {
        orderBy: { versionSeq: "desc" },
        take: 1,
        select: { tierIds: true }
      }
    }
  });
  type PostInfo = { tierIds: string[]; isPublic: boolean };
  const postByKey = new Map<string, PostInfo>();
  for (const p of postRows) {
    postByKey.set(`${p.creatorId}\0${p.id}`, {
      tierIds: p.versions[0]?.tierIds ?? [],
      isPublic: p.isPublic
    });
  }

  // 2) Fetch viewer's entitlement snapshots for every distinct creator we care about.
  //    `getAccountSnapshotsForCreators` returns at most one snapshot per creator (the unique
  //    pair on `PatronEntitlementSnapshot` is `(patronMembershipId, relayCreatorId)`, but a given
  //    Account may hold multiple memberships per creator only in pathological cases — we collapse
  //    those by taking the most-recently-asOf snapshot).
  const snapshotByCreator = args.viewer_account_id
    ? await getAccountSnapshotsForCreators(
        args.prisma,
        args.viewer_account_id,
        creatorIds
      )
    : new Map<string, PatronEntitlementSnapshotLite>();

  // 3) Decide per target.
  for (const t of uniqueTargets.values()) {
    const info = postByKey.get(`${t.source_creator_id}\0${t.source_post_id}`);
    if (info === undefined) {
      out.set(targetKey(t), lockedDecision([], "missing_snapshot"));
      continue;
    }
    if (info.isPublic || info.tierIds.length === 0) {
      out.set(targetKey(t), FREE_POST);
      continue;
    }
    if (!args.viewer_account_id) {
      out.set(targetKey(t), lockedDecision(info.tierIds, "missing_snapshot"));
      continue;
    }
    const snap = snapshotByCreator.get(t.source_creator_id) ?? null;
    out.set(targetKey(t), decideFromSnapshot(snap, info.tierIds));
  }

  return out;
}

export function targetKey(t: ViewerEntitlementSourceTarget): string {
  return `${t.source_creator_id}\0${t.source_post_id}`;
}

// --- internals --------------------------------------------------------------

type PatronEntitlementSnapshotLite = {
  entitledTierIds: string[];
  active: boolean;
};

function decideFromSnapshot(
  snap: PatronEntitlementSnapshotLite | null,
  requiredTierIds: readonly string[]
): ViewerEntitlementDecision {
  if (!snap) {
    return lockedDecision(requiredTierIds, "missing_snapshot");
  }
  if (!snap.active) {
    return lockedDecision(requiredTierIds, "inactive_snapshot");
  }
  const entitled = new Set(snap.entitledTierIds);
  for (const t of requiredTierIds) {
    if (entitled.has(t)) {
      return visibleDecision(requiredTierIds);
    }
  }
  return lockedDecision(requiredTierIds, "active_snapshot");
}

async function loadAccountSnapshotForCreator(
  prisma: PrismaClient | Prisma.TransactionClient,
  accountId: string,
  relayCreatorId: string
): Promise<PatronEntitlementSnapshotLite | null> {
  const memberships = await prisma.tenantMembership.findMany({
    where: {
      accountId,
      tenant: { relayCreatorId }
    },
    select: { id: true }
  });
  if (memberships.length === 0) {
    return null;
  }
  const membershipIds = memberships.map((m) => m.id);
  const snap = await prisma.patronEntitlementSnapshot.findFirst({
    where: { patronMembershipId: { in: membershipIds }, relayCreatorId },
    orderBy: { asOf: "desc" },
    select: { entitledTierIds: true, active: true }
  });
  return snap ? { entitledTierIds: snap.entitledTierIds, active: snap.active } : null;
}

async function getAccountSnapshotsForCreators(
  prisma: PrismaClient | Prisma.TransactionClient,
  accountId: string,
  relayCreatorIds: readonly string[]
): Promise<Map<string, PatronEntitlementSnapshotLite>> {
  const result = new Map<string, PatronEntitlementSnapshotLite>();
  if (relayCreatorIds.length === 0) {
    return result;
  }
  const memberships = await prisma.tenantMembership.findMany({
    where: {
      accountId,
      tenant: { relayCreatorId: { in: [...relayCreatorIds] } }
    },
    select: { id: true, tenant: { select: { relayCreatorId: true } } }
  });
  if (memberships.length === 0) {
    return result;
  }
  const membershipIds = memberships.map((m) => m.id);
  const snaps = await prisma.patronEntitlementSnapshot.findMany({
    where: { patronMembershipId: { in: membershipIds } },
    orderBy: { asOf: "desc" },
    select: {
      patronMembershipId: true,
      relayCreatorId: true,
      entitledTierIds: true,
      active: true
    }
  });
  for (const s of snaps) {
    if (!result.has(s.relayCreatorId)) {
      result.set(s.relayCreatorId, {
        entitledTierIds: s.entitledTierIds,
        active: s.active
      });
    }
  }
  return result;
}

/**
 * Resolve the patron's CURRENT entitled tier ids for the given creator. Used by callers that
 * want to record a forensic `snapshot_tier_ids` value at save time. Returns an empty array if
 * the patron has no snapshot for this creator (free-tier or unlinked) — that's still meaningful
 * forensic data ("they had no entitlement when they saved").
 */
export async function resolveCurrentEntitledTierIdsForAccount(
  prisma: PrismaClient | Prisma.TransactionClient,
  accountId: string | null,
  relayCreatorId: string
): Promise<string[]> {
  if (!accountId) {
    return [];
  }
  const snap = await loadAccountSnapshotForCreator(prisma, accountId, relayCreatorId);
  return snap && snap.active ? [...snap.entitledTierIds] : [];
}

export type { ViewerEntitlementDecision, ViewerEntitlementState };
