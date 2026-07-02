/**
 * @fileoverview Public patron saved-collection detail — viewer-aware entry listing.
 * @description Returns null for missing or non-public collections (enumeration resistance).
 */

import type { PrismaClient } from "@prisma/client";
import type {
  PatronCollectionEntryRecord,
  PatronCollectionEntryWithViewerEntitlement,
} from "../gallery/types.js";
import {
  computeViewerEntitlementsForPostsBulk,
  targetKey as viewerEntitlementTargetKey,
} from "./viewer-entitlement.js";
import { loadHideMatureContentForAccount } from "./patron-content-preferences.js";
import {
  isPostExcludedByPatronMaturePref,
  loadMaturePostIdsByCreator,
} from "../gallery/mature-post-ids.js";

export type PublicPatronCollectionDetail = {
  collection_id: string;
  title: string;
  entry_count: number;
  created_at: string;
  entries: PatronCollectionEntryWithViewerEntitlement[];
};

function entryRowToRecord(row: {
  id: string;
  collectionId: string;
  patronMembershipId: string;
  creatorId: string;
  postId: string;
  mediaId: string;
  createdAt: Date;
  snapshotTierIds: string[];
}): PatronCollectionEntryRecord {
  return {
    entry_id: row.id,
    collection_id: row.collectionId,
    user_id: row.patronMembershipId,
    creator_id: row.creatorId,
    post_id: row.postId,
    media_id: row.mediaId,
    created_at: row.createdAt.toISOString(),
    snapshot_tier_ids: row.snapshotTierIds ?? [],
  };
}

/**
 * Public collection detail for `/api/v1/public/patron-collections/:collection_id`.
 * `viewerAccountId` is the caller's Account.id when authenticated; null for anonymous.
 */
export async function getPublicPatronCollectionDetail(
  prisma: PrismaClient,
  collectionId: string,
  viewerAccountId: string | null
): Promise<PublicPatronCollectionDetail | null> {
  const trimmedId = collectionId.trim();
  if (!trimmedId) return null;

  const col = await prisma.patronSavedCollection.findFirst({
    where: { id: trimmedId, isPublic: true },
    select: {
      id: true,
      title: true,
      createdAt: true,
      entries: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          collectionId: true,
          patronMembershipId: true,
          creatorId: true,
          postId: true,
          mediaId: true,
          createdAt: true,
          snapshotTierIds: true,
        },
      },
    },
  });
  if (!col) return null;

  const entryRecords = col.entries.map(entryRowToRecord);
  const hideMatureContent = viewerAccountId
    ? await loadHideMatureContentForAccount(prisma, viewerAccountId)
    : false;
  const creatorIds = [...new Set(entryRecords.map((e) => e.creator_id))];
  const maturePostIdsByCreator = hideMatureContent
    ? await loadMaturePostIdsByCreator(prisma, creatorIds)
    : new Map<string, Set<string>>();
  const visibleEntryRecords = hideMatureContent
    ? entryRecords.filter(
        (e) =>
          !isPostExcludedByPatronMaturePref({
            hideMatureContent,
            maturePostIdsByCreator,
            creatorId: e.creator_id,
            postId: e.post_id,
          })
      )
    : entryRecords;

  const targets = visibleEntryRecords.map((e) => ({
    source_creator_id: e.creator_id,
    source_post_id: e.post_id,
  }));
  const decisions = await computeViewerEntitlementsForPostsBulk({
    prisma,
    viewer_account_id: viewerAccountId,
    targets,
  });

  const enrichedEntries: PatronCollectionEntryWithViewerEntitlement[] = visibleEntryRecords.map(
    (e) => ({
      ...e,
      viewer_entitlement:
        decisions.get(
          viewerEntitlementTargetKey({
            source_creator_id: e.creator_id,
            source_post_id: e.post_id,
          })
        ) ?? {
          state: "locked",
          required_tier_ids: [],
          source: "missing_snapshot",
        },
    })
  );

  return {
    collection_id: col.id,
    title: col.title,
    entry_count: enrichedEntries.length,
    created_at: col.createdAt.toISOString(),
    entries: enrichedEntries,
  };
}
