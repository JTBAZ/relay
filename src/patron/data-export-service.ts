/**
 * PE-J (BO-P4-02) — patron data export.
 *
 * Returns a single JSON-serializable bundle with everything we hold for a given Account:
 *   - account row (sans sensitive secrets — passwordHash + supabaseUserId stripped)
 *   - memberships (per-creator profile, follows, entitlement snapshots)
 *   - patron-side favorites + collections (+entries)
 *   - account-level outgoing follows (incoming follows are NOT included; that's other people's data)
 *   - own comments (across every creator scope)
 *   - own reactions
 *   - own notifications + preferences
 *   - own content reports (filed)
 *
 * Out of scope (intentional):
 *   - OAuth tokens (PatronOAuthCredential.encryptedPayload)
 *   - Other people's comments / reactions / reports about you (privacy axis)
 *   - Outbox events / moderation actions (operational telemetry; not "your data" in the GDPR sense)
 *
 * The bundle is built synchronously in memory; the patron data set is small (typical patron
 * < 5MB JSON). When export size grows past ~50MB we'll move to a background job that writes
 * an object to storage and emails a download link, but that's PE-J v2.
 */

import type { PrismaClient } from "@prisma/client";

export interface PatronExportBundle {
  /** Schema version of this bundle so downstream tooling can branch deterministically. */
  schema_version: "1.0";
  exported_at: string;
  account: {
    id: string;
    email_norm: string | null;
    auth_provider: string;
    patron_patreon_user_id: string | null;
    primary_relay_creator_id: string | null;
    created_at: string;
    updated_at: string;
  };
  memberships: Array<{
    id: string;
    tenant_id: string;
    relay_creator_id: string | null;
    role: string;
    tier_ids: string[];
    created_at: string;
    profile: {
      handle: string | null;
      display_name: string | null;
      bio: string | null;
      avatar_url: string | null;
      banner_url: string | null;
      is_public: boolean;
    } | null;
    follows: Array<{ relay_creator_id: string; created_at: string }>;
    entitlement_snapshots: Array<{
      relay_creator_id: string;
      entitled_tier_ids: string[];
      active: boolean;
      as_of: string;
      stale_after: string | null;
    }>;
  }>;
  favorites: Array<{
    creator_id: string;
    target_kind: string;
    target_id: string;
    snapshot_tier_ids: string[];
    created_at: string;
  }>;
  collections: Array<{
    id: string;
    creator_id: string;
    title: string;
    sort_order: number;
    is_public: boolean;
    created_at: string;
    entries: Array<{
      id: string;
      post_id: string;
      media_id: string;
      snapshot_tier_ids: string[];
      created_at: string;
    }>;
  }>;
  account_follows_outgoing: Array<{ followed_account_id: string; created_at: string }>;
  comments: Array<{
    id: string;
    relay_creator_id: string;
    post_id: string;
    media_id: string | null;
    body: string;
    tag_ids: string[];
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
    mod_state: string;
  }>;
  comment_reactions: Array<{
    comment_id: string;
    kind: string;
    created_at: string;
  }>;
  notifications: Array<{
    id: string;
    relay_creator_id: string;
    kind: string;
    payload: unknown;
    cluster_count: number;
    read_at: string | null;
    created_at: string;
  }>;
  notification_preferences: Array<{
    relay_creator_id: string;
    preference_type: string;
    enabled: boolean;
    updated_at: string;
  }>;
  content_reports_filed: Array<{
    id: string;
    target_kind: string;
    target_id: string;
    reason_code: string;
    body: string | null;
    status: string;
    created_at: string;
  }>;
}

/** Build the bundle for an account. Caller is responsible for authz (route-level). */
export async function buildPatronExportBundle(
  prisma: PrismaClient,
  accountId: string
): Promise<PatronExportBundle> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      emailNorm: true,
      identityAuthProvider: true,
      patronPatreonUserId: true,
      primaryRelayCreatorId: true,
      createdAt: true,
      updatedAt: true
    }
  });
  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  const membershipRows = await prisma.tenantMembership.findMany({
    where: { accountId },
    select: {
      id: true,
      tenantId: true,
      role: true,
      tierIds: true,
      createdAt: true,
      tenant: { select: { relayCreatorId: true } }
    }
  });
  const membershipIds = membershipRows.map((m) => m.id);
  const [profileRows, followRows, snapshotRows] = await Promise.all([
    membershipIds.length > 0
      ? prisma.patronProfile.findMany({
          where: { tenantMembershipId: { in: membershipIds } }
        })
      : Promise.resolve([]),
    membershipIds.length > 0
      ? prisma.patronFollow.findMany({
          where: { patronMembershipId: { in: membershipIds } },
          select: {
            patronMembershipId: true,
            relayCreatorId: true,
            createdAt: true
          }
        })
      : Promise.resolve([]),
    membershipIds.length > 0
      ? prisma.patronEntitlementSnapshot.findMany({
          where: { patronMembershipId: { in: membershipIds } },
          select: {
            patronMembershipId: true,
            relayCreatorId: true,
            entitledTierIds: true,
            active: true,
            asOf: true,
            staleAfter: true
          }
        })
      : Promise.resolve([])
  ]);
  // Build per-membership lookups so the bundle assembly stays O(rows) not O(rows*memberships).
  const profilesByMembership = new Map(
    profileRows.map((p) => [p.tenantMembershipId, p])
  );
  const followsByMembership = new Map<
    string,
    Array<{ relayCreatorId: string; createdAt: Date }>
  >();
  for (const f of followRows) {
    const arr = followsByMembership.get(f.patronMembershipId) ?? [];
    arr.push({ relayCreatorId: f.relayCreatorId, createdAt: f.createdAt });
    followsByMembership.set(f.patronMembershipId, arr);
  }
  const snapshotsByMembership = new Map<
    string,
    Array<{
      relayCreatorId: string;
      entitledTierIds: string[];
      active: boolean;
      asOf: Date;
      staleAfter: Date | null;
    }>
  >();
  for (const s of snapshotRows) {
    const arr = snapshotsByMembership.get(s.patronMembershipId) ?? [];
    arr.push({
      relayCreatorId: s.relayCreatorId,
      entitledTierIds: s.entitledTierIds,
      active: s.active,
      asOf: s.asOf,
      staleAfter: s.staleAfter
    });
    snapshotsByMembership.set(s.patronMembershipId, arr);
  }

  const [
    favorites,
    collections,
    follows,
    comments,
    reactions,
    notifications,
    notificationPrefs,
    reportsFiled
  ] = await Promise.all([
    membershipIds.length > 0
      ? prisma.patronFavorite.findMany({
          where: { patronMembershipId: { in: membershipIds } }
        })
      : Promise.resolve([]),
    membershipIds.length > 0
      ? prisma.patronSavedCollection.findMany({
          where: { patronMembershipId: { in: membershipIds } },
          include: { entries: true },
          orderBy: { sortOrder: "asc" }
        })
      : Promise.resolve([]),
    prisma.accountFollow.findMany({
      where: { followerAccountId: accountId },
      orderBy: { createdAt: "asc" }
    }),
    membershipIds.length > 0
      ? prisma.comment.findMany({
          where: { patronUserId: { in: membershipIds } },
          orderBy: { createdAt: "asc" }
        })
      : Promise.resolve([]),
    prisma.commentReaction.findMany({
      where: { accountId },
      orderBy: { createdAt: "asc" }
    }),
    membershipIds.length > 0
      ? prisma.notification.findMany({
          where: { recipientMembershipId: { in: membershipIds } },
          orderBy: { createdAt: "desc" }
        })
      : Promise.resolve([]),
    membershipIds.length > 0
      ? prisma.notificationPreference.findMany({
          where: { patronMembershipId: { in: membershipIds } }
        })
      : Promise.resolve([]),
    prisma.contentReport.findMany({
      where: { reporterAccountId: accountId },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return {
    schema_version: "1.0",
    exported_at: new Date().toISOString(),
    account: {
      id: account.id,
      email_norm: account.emailNorm,
      auth_provider: account.identityAuthProvider,
      patron_patreon_user_id: account.patronPatreonUserId,
      primary_relay_creator_id: account.primaryRelayCreatorId,
      created_at: account.createdAt.toISOString(),
      updated_at: account.updatedAt.toISOString()
    },
    memberships: membershipRows.map((m) => {
      const profile = profilesByMembership.get(m.id) ?? null;
      const follows = followsByMembership.get(m.id) ?? [];
      const snapshots = snapshotsByMembership.get(m.id) ?? [];
      return {
        id: m.id,
        tenant_id: m.tenantId,
        relay_creator_id: m.tenant?.relayCreatorId ?? null,
        role: m.role,
        tier_ids: m.tierIds,
        created_at: m.createdAt.toISOString(),
        profile: profile
          ? {
              handle: profile.handle ?? null,
              display_name: profile.displayName ?? null,
              bio: profile.bio ?? null,
              avatar_url: profile.avatarUrl ?? null,
              banner_url: profile.bannerUrl ?? null,
              is_public: profile.isPublic
            }
          : null,
        follows: follows.map((f) => ({
          relay_creator_id: f.relayCreatorId,
          created_at: f.createdAt.toISOString()
        })),
        entitlement_snapshots: snapshots.map((s) => ({
          relay_creator_id: s.relayCreatorId,
          entitled_tier_ids: s.entitledTierIds,
          active: s.active,
          as_of: s.asOf.toISOString(),
          stale_after: s.staleAfter ? s.staleAfter.toISOString() : null
        }))
      };
    }),
    favorites: favorites.map((f) => ({
      creator_id: f.creatorId,
      target_kind: f.targetKind,
      target_id: f.targetId,
      snapshot_tier_ids: f.snapshotTierIds,
      created_at: f.createdAt.toISOString()
    })),
    collections: collections.map((c) => ({
      id: c.id,
      creator_id: c.creatorId,
      title: c.title,
      sort_order: c.sortOrder,
      is_public: c.isPublic,
      created_at: c.createdAt.toISOString(),
      entries: c.entries.map((e) => ({
        id: e.id,
        post_id: e.postId,
        media_id: e.mediaId,
        snapshot_tier_ids: e.snapshotTierIds,
        created_at: e.createdAt.toISOString()
      }))
    })),
    account_follows_outgoing: follows.map((f) => ({
      followed_account_id: f.followedAccountId,
      created_at: f.createdAt.toISOString()
    })),
    comments: comments.map((c) => ({
      id: c.id,
      relay_creator_id: c.relayCreatorId,
      post_id: c.postId,
      media_id: c.mediaId,
      body: c.body,
      tag_ids: c.tagIds,
      created_at: c.createdAt.toISOString(),
      edited_at: c.editedAt ? c.editedAt.toISOString() : null,
      deleted_at: c.deletedAt ? c.deletedAt.toISOString() : null,
      mod_state: c.modState
    })),
    comment_reactions: reactions.map((r) => ({
      comment_id: r.commentId,
      kind: r.kind,
      created_at: r.createdAt.toISOString()
    })),
    notifications: notifications.map((n) => ({
      id: n.id,
      relay_creator_id: n.relayCreatorId,
      kind: n.kind,
      payload: n.payloadJson,
      cluster_count: n.clusterCount,
      read_at: n.readAt ? n.readAt.toISOString() : null,
      created_at: n.createdAt.toISOString()
    })),
    notification_preferences: notificationPrefs.map((p) => ({
      relay_creator_id: p.relayCreatorId,
      preference_type: p.preferenceType,
      enabled: p.enabled,
      updated_at: p.updatedAt.toISOString()
    })),
    content_reports_filed: reportsFiled.map((r) => ({
      id: r.id,
      target_kind: r.targetKind,
      target_id: r.targetId,
      reason_code: r.reasonCode,
      body: r.body,
      status: r.status,
      created_at: r.createdAt.toISOString()
    }))
  };
}
