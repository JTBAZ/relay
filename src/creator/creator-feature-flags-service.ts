/**
 * @fileoverview Manually-set per-creator feature gates (`CreatorFeatureFlag`).
 * Ops route / CLI can flip flags; MB-3 also unlocks Better surfaces via CreatorPlanEntitlement.
 */

import type { PrismaClient } from "@prisma/client";
import { isAutopostBetterAllowed } from "../billing/creator-plan-entitlement-service.js";

export type CreatorFeatureFlagsWire = {
  creator_id: string;
  posting_assistant_enabled: boolean;
  updated_at: string | null;
};

function defaultFlagsWire(creatorId: string): CreatorFeatureFlagsWire {
  return { creator_id: creatorId, posting_assistant_enabled: false, updated_at: null };
}

export async function getCreatorFeatureFlags(
  prisma: PrismaClient,
  creatorId: string
): Promise<CreatorFeatureFlagsWire> {
  const id = creatorId.trim();
  const row = await prisma.creatorFeatureFlag.findUnique({ where: { creatorId: id } });
  if (!row) return defaultFlagsWire(id);
  return {
    creator_id: id,
    posting_assistant_enabled: row.postingAssistantEnabled,
    updated_at: row.updatedAt.toISOString()
  };
}

/**
 * Env kill-switch takes priority when set to "true" (ops emergency disable across all creators).
 * Otherwise: Autopost plan+ OR legacy per-creator posting_assistant flag (MB-3 bridge).
 */
export async function isPostingAssistantAllowedForCreator(
  prisma: PrismaClient,
  creatorId: string
): Promise<boolean> {
  if (process.env.RELAY_POSTING_ASSISTANT_DISABLED === "true") return false;
  if (process.env.RELAY_POSTING_ASSISTANT_OPEN_FOR_ALL === "true") return true;
  return isAutopostBetterAllowed(prisma, creatorId);
}

export async function setCreatorPostingAssistantEnabled(
  prisma: PrismaClient,
  creatorId: string,
  enabled: boolean
): Promise<CreatorFeatureFlagsWire> {
  const id = creatorId.trim();
  const row = await prisma.creatorFeatureFlag.upsert({
    where: { creatorId: id },
    create: { creatorId: id, postingAssistantEnabled: enabled },
    update: { postingAssistantEnabled: enabled }
  });
  return {
    creator_id: id,
    posting_assistant_enabled: row.postingAssistantEnabled,
    updated_at: row.updatedAt.toISOString()
  };
}
