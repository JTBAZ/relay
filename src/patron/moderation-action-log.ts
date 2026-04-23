/**
 * PE-E — append-only ModerationAction log helper. Every mutating moderation call goes through
 * here so the audit trail is complete and the read path (creator moderation queue) can list
 * actions per (target_kind, target_id) without scanning subsystem-specific tables.
 *
 * Reversible kinds (e.g. comment_hide / comment_unhide) log a paired entry rather than mutating
 * the original row. This keeps the log immutable and makes "show timeline of actions on this
 * comment" trivial.
 */

import type {
  ModerationActionKind,
  ModerationActorKind,
  ModerationTargetKind,
  PrismaClient
} from "@prisma/client";
import { Prisma } from "@prisma/client";

export interface RecordModerationActionInput {
  relayCreatorId?: string;
  actorKind: ModerationActorKind;
  actorAccountId?: string | null;
  kind: ModerationActionKind;
  targetKind: ModerationTargetKind;
  targetId: string;
  payload?: Record<string, unknown>;
}

export async function recordModerationAction(
  prisma: PrismaClient,
  input: RecordModerationActionInput
): Promise<{ id: string }> {
  const row = await prisma.moderationAction.create({
    data: {
      relayCreatorId: input.relayCreatorId ?? "",
      actorKind: input.actorKind,
      actorAccountId: input.actorAccountId ?? null,
      kind: input.kind,
      targetKind: input.targetKind,
      targetId: input.targetId,
      payloadJson:
        input.payload === undefined
          ? Prisma.DbNull
          : (input.payload as Prisma.InputJsonValue)
    },
    select: { id: true }
  });
  return row;
}

export async function listModerationActionsForTarget(
  prisma: PrismaClient,
  args: { targetKind: ModerationTargetKind; targetId: string; limit?: number }
): Promise<
  {
    id: string;
    kind: ModerationActionKind;
    actorKind: ModerationActorKind;
    actorAccountId: string | null;
    payload: unknown;
    createdAt: Date;
  }[]
> {
  const rows = await prisma.moderationAction.findMany({
    where: { targetKind: args.targetKind, targetId: args.targetId },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(args.limit ?? 100, 500))
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    actorKind: r.actorKind,
    actorAccountId: r.actorAccountId,
    payload: r.payloadJson,
    createdAt: r.createdAt
  }));
}
