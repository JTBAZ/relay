/**
 * @fileoverview Patron experience module notification-event-emit.ts — see exported symbols.
 * @see {@link ../jsdoc-core-entities.ts}
 * @see prisma/schema.prisma Account, TenantMembership, and related patron tables
 * @security-audit-required Patron PII or entitlement paths — audit responses and logs.
 */
/**
 * PE-G (BO-P3-03) — small helper for emitting `OutboxEvent` rows that the notification
 * delivery worker consumes. Centralized so producers (comment-service, account-follow-service,
 * etc.) don't repeat the deduped insert / P2002 swallow logic.
 *
 * Failures are intentionally swallowed (with stderr breadcrumb) -- a producer must not fail
 * its own write because notifications could not be queued.
 */

import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { PEG_EVENT_NAMES } from "./notification-mapper.js";

interface EmitArgs {
  eventName: string;
  /** Tenant scope (typically `relay_creator_id`); empty string for platform-wide events. */
  tenantId: string;
  /** Subject id (typically the producer's primary entity id). */
  primaryId: string;
  payload: Record<string, unknown>;
  /** Defaults to now. */
  occurredAt?: Date;
  /** Defaults to a fresh UUID; pass when you want propagation from an upstream HTTP trace. */
  traceId?: string;
  /** Module name for ops triage (e.g. "comment-service"). */
  producer: string;
  /** Schema version of the payload shape. Bump when breaking. */
  version?: string;
}

export async function emitNotificationOutboxEvent(
  prisma: PrismaClient,
  args: EmitArgs
): Promise<void> {
  const occurredAt = args.occurredAt ?? new Date();
  const eventId = randomUUID();
  const traceId = args.traceId ?? `trace_${randomUUID()}`;
  try {
    await prisma.outboxEvent.create({
      data: {
        eventId,
        eventName: args.eventName,
        tenantId: args.tenantId,
        primaryId: args.primaryId,
        occurredAt,
        traceId,
        producer: args.producer,
        version: args.version ?? "1.0",
        payload: args.payload as Prisma.InputJsonValue
      }
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      // Dedupe collision on (event_name, tenant_id, primary_id, occurred_at). Acceptable.
      return;
    }
    // eslint-disable-next-line no-console -- producer must not fail because of telemetry
    console.error(`emitNotificationOutboxEvent(${args.eventName}) failed`, err);
  }
}

// ── Convenience helpers for the v1 producers ──────────────────────────────────

/** Comment created -- mapper resolves parent author for reply notifications. */
export async function emitCommentCreatedEvent(
  prisma: PrismaClient,
  args: {
    commentId: string;
    relayCreatorId: string;
    postId: string;
    parentCommentId: string | null;
    authorMembershipId: string;
  }
): Promise<void> {
  await emitNotificationOutboxEvent(prisma, {
    eventName: PEG_EVENT_NAMES.COMMENT_CREATED,
    tenantId: args.relayCreatorId,
    primaryId: args.commentId,
    producer: "comment-service",
    payload: {
      comment_id: args.commentId,
      relay_creator_id: args.relayCreatorId,
      post_id: args.postId,
      parent_comment_id: args.parentCommentId,
      author_membership_id: args.authorMembershipId
    }
  });
}

/** Reaction toggled ON -- mapper notifies the comment author. Toggling OFF is silent. */
export async function emitCommentReactionAddedEvent(
  prisma: PrismaClient,
  args: {
    commentId: string;
    relayCreatorId: string;
    accountId: string;
    kind: string;
  }
): Promise<void> {
  await emitNotificationOutboxEvent(prisma, {
    eventName: PEG_EVENT_NAMES.COMMENT_REACTION_ADDED,
    tenantId: args.relayCreatorId,
    primaryId: args.commentId,
    producer: "comment-reaction-service",
    payload: {
      comment_id: args.commentId,
      relay_creator_id: args.relayCreatorId,
      account_id: args.accountId,
      kind: args.kind
    }
  });
}

/** Account follow created -- mapper fans out to followed account's memberships. */
export async function emitAccountFollowCreatedEvent(
  prisma: PrismaClient,
  args: { followerAccountId: string; followedAccountId: string }
): Promise<void> {
  await emitNotificationOutboxEvent(prisma, {
    eventName: PEG_EVENT_NAMES.ACCOUNT_FOLLOW_CREATED,
    // Account-level event: no creator scope. Empty tenantId accepted by OutboxEvent schema.
    tenantId: "",
    primaryId: args.followedAccountId,
    producer: "account-follow-service",
    payload: {
      follower_account_id: args.followerAccountId,
      followed_account_id: args.followedAccountId
    }
  });
}
