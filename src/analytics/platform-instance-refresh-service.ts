/**
 * Performance intelligence Phase 4 — safe manual refresh + cooldown policy.
 * @see docs/analytics/SAFE_REFRESH.md
 */

import type { PrismaClient } from "@prisma/client";
import { computeDailyRollups } from "./external-metric-rollup-service.js";
import { touchPlatformInstanceLastRefreshed } from "./platform-instance-service.js";

export const REFRESH_POLICY_CONSERVATIVE = "conservative";
export const REFRESH_POLICY_MANUAL_ONLY = "manual_only";
export const REFRESH_POLICY_DISABLED = "disabled";

export const EXTENSION_HANDOFF_DESTINATIONS = new Set(["patreon", "x", "deviantart"]);

const DEFAULT_MANUAL_COOLDOWN_MS = 15 * 60 * 1000;
const DEFAULT_STALE_AFTER_MS = 48 * 60 * 60 * 1000;
const DEFAULT_ROLLUP_LOOKBACK_DAYS = 2;

const MANUAL_COOLDOWN_MS_BY_DESTINATION: Record<string, number> = {
  relay: 5 * 60 * 1000,
  patreon: 15 * 60 * 1000,
  x: 30 * 60 * 1000,
  deviantart: 30 * 60 * 1000,
  bluesky: 30 * 60 * 1000
};

export type PlatformInstanceRefreshStatus =
  | "completed"
  | "handoff_required"
  | "cooldown"
  | "disabled"
  | "unsupported_destination"
  | "missing_link";

export type PlatformInstanceRefreshHandoffWire = {
  post_id: string;
  attempt_id: string;
  destination: string;
  external_url: string;
};

export type PlatformInstanceRefreshWire = {
  platform_instance_id: string;
  destination: string;
  status: PlatformInstanceRefreshStatus;
  method:
    | "relay_engagement_rollup"
    | "csv_rollup_overlay"
    | "extension_dom"
    | "platform_api"
    | null;
  handoff: PlatformInstanceRefreshHandoffWire | null;
  cooldown: {
    retry_after_seconds: number;
    next_allowed_at: string;
  } | null;
  rollup_upserted: number | null;
  last_refreshed_at: string | null;
  last_manual_refresh_requested_at: string | null;
  message: string | null;
};

export type PlatformInstanceRefreshStatusWire = {
  platform_instance_id: string;
  destination: string;
  refresh_policy: string;
  status: string;
  can_refresh_manually: boolean;
  cooldown_active: boolean;
  retry_after_seconds: number;
  next_allowed_at: string | null;
  last_refreshed_at: string | null;
  last_manual_refresh_requested_at: string | null;
  stale: boolean;
  recommended_method: "extension_handoff" | "relay_rollup" | "csv_rollup_overlay" | "none";
};

type PlatformInstanceRow = {
  id: string;
  creatorId: string;
  postId: string;
  destination: string;
  externalUrl: string | null;
  externalId: string | null;
  attemptId: string | null;
  linkSource: string;
  status: string;
  refreshPolicy: string;
  linkedAt: Date;
  lastRefreshedAt: Date | null;
  lastManualRefreshRequestedAt: Date | null;
};

export type PlatformInstanceRefreshEligibilityWire = {
  refresh_eligible: boolean;
  can_refresh_manually: boolean;
  cooldown_active: boolean;
  retry_after_seconds: number;
  next_allowed_at: string | null;
  stale: boolean;
  recommended_method: PlatformInstanceRefreshStatusWire["recommended_method"];
};

export function platformInstanceRefreshEligibility(
  instance: PlatformInstanceRow,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env
): PlatformInstanceRefreshEligibilityWire {
  const cooldown = evaluatePlatformInstanceRefreshCooldown(instance, now, env);
  const canRefreshManually =
    instance.refreshPolicy !== REFRESH_POLICY_DISABLED &&
    recommendedRefreshMethod(instance) !== "none";

  return {
    refresh_eligible: canRefreshManually && !cooldown.active,
    can_refresh_manually: canRefreshManually,
    cooldown_active: cooldown.active,
    retry_after_seconds: cooldown.retryAfterSeconds,
    next_allowed_at: cooldown.nextAllowedAt?.toISOString() ?? null,
    stale: isPlatformInstanceStale(instance, now, env),
    recommended_method: recommendedRefreshMethod(instance)
  };
}

export function manualCooldownMsForDestination(
  destination: string,
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env.RELAY_PLATFORM_INSTANCE_MANUAL_COOLDOWN_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 60_000) {
      return Math.floor(n);
    }
  }
  return MANUAL_COOLDOWN_MS_BY_DESTINATION[destination.trim()] ?? DEFAULT_MANUAL_COOLDOWN_MS;
}

export function platformInstanceStaleAfterMsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env.RELAY_PLATFORM_INSTANCE_STALE_AFTER_MS?.trim();
  if (!raw) return DEFAULT_STALE_AFTER_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 3_600_000) return DEFAULT_STALE_AFTER_MS;
  return Math.floor(n);
}

function rollupLookbackDaysFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.RELAY_PLATFORM_INSTANCE_REFRESH_ROLLUP_LOOKBACK_DAYS?.trim();
  if (!raw) return DEFAULT_ROLLUP_LOOKBACK_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_ROLLUP_LOOKBACK_DAYS;
  return Math.min(Math.floor(n), 31);
}

function cooldownAnchor(instance: PlatformInstanceRow): Date | null {
  const requested = instance.lastManualRefreshRequestedAt;
  const refreshed = instance.lastRefreshedAt;
  if (requested && refreshed) {
    return requested > refreshed ? requested : refreshed;
  }
  return requested ?? refreshed ?? null;
}

export function evaluatePlatformInstanceRefreshCooldown(
  instance: PlatformInstanceRow,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env
): { active: boolean; retryAfterSeconds: number; nextAllowedAt: Date | null } {
  const anchor = cooldownAnchor(instance);
  if (!anchor) {
    return { active: false, retryAfterSeconds: 0, nextAllowedAt: null };
  }

  const cooldownMs = manualCooldownMsForDestination(instance.destination, env);
  const elapsedMs = now.getTime() - anchor.getTime();
  if (elapsedMs >= cooldownMs) {
    return { active: false, retryAfterSeconds: 0, nextAllowedAt: null };
  }

  const remainingMs = cooldownMs - elapsedMs;
  return {
    active: true,
    retryAfterSeconds: Math.ceil(remainingMs / 1000),
    nextAllowedAt: new Date(now.getTime() + remainingMs)
  };
}

export function isPlatformInstanceStale(
  instance: PlatformInstanceRow,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const staleAfterMs = platformInstanceStaleAfterMsFromEnv(env);
  const anchor = instance.lastRefreshedAt ?? instance.linkedAt;
  return now.getTime() - anchor.getTime() > staleAfterMs;
}

export function recommendedRefreshMethod(
  instance: PlatformInstanceRow
): PlatformInstanceRefreshStatusWire["recommended_method"] {
  if (instance.refreshPolicy === REFRESH_POLICY_DISABLED) return "none";
  if (instance.destination === "relay") return "relay_rollup";
  if (instance.destination === "patreon" && instance.externalUrl?.trim()) {
    return "extension_handoff";
  }
  if (instance.destination === "patreon") return "csv_rollup_overlay";
  if (instance.externalUrl?.trim() && EXTENSION_HANDOFF_DESTINATIONS.has(instance.destination)) {
    return "extension_handoff";
  }
  return "none";
}

async function loadOwnedPlatformInstance(
  prisma: PrismaClient,
  creatorId: string,
  platformInstanceId: string
): Promise<PlatformInstanceRow | null> {
  return prisma.platformInstance.findFirst({
    where: {
      id: platformInstanceId.trim(),
      creatorId: creatorId.trim()
    },
    select: {
      id: true,
      creatorId: true,
      postId: true,
      destination: true,
      externalUrl: true,
      externalId: true,
      attemptId: true,
      linkSource: true,
      status: true,
      refreshPolicy: true,
      linkedAt: true,
      lastRefreshedAt: true,
      lastManualRefreshRequestedAt: true
    }
  });
}

function mapRefreshStatus(instance: PlatformInstanceRow): PlatformInstanceRefreshStatusWire {
  const now = new Date();
  const cooldown = evaluatePlatformInstanceRefreshCooldown(instance, now);
  const canRefreshManually =
    instance.refreshPolicy !== REFRESH_POLICY_DISABLED &&
    recommendedRefreshMethod(instance) !== "none";

  return {
    platform_instance_id: instance.id,
    destination: instance.destination,
    refresh_policy: instance.refreshPolicy,
    status: instance.status,
    can_refresh_manually: canRefreshManually,
    cooldown_active: cooldown.active,
    retry_after_seconds: cooldown.retryAfterSeconds,
    next_allowed_at: cooldown.nextAllowedAt?.toISOString() ?? null,
    last_refreshed_at: instance.lastRefreshedAt?.toISOString() ?? null,
    last_manual_refresh_requested_at:
      instance.lastManualRefreshRequestedAt?.toISOString() ?? null,
    stale: isPlatformInstanceStale(instance, now),
    recommended_method: recommendedRefreshMethod(instance)
  };
}

export async function getPlatformInstanceRefreshStatus(
  prisma: PrismaClient,
  relayCreatorId: string,
  platformInstanceId: string
): Promise<
  { ok: true; status: PlatformInstanceRefreshStatusWire } | { ok: false; code: "NO_TENANT" | "NOT_FOUND" }
> {
  const creatorId = relayCreatorId.trim();
  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: creatorId },
    select: { id: true }
  });
  if (!tenant) return { ok: false, code: "NO_TENANT" };

  const instance = await loadOwnedPlatformInstance(prisma, creatorId, platformInstanceId);
  if (!instance) return { ok: false, code: "NOT_FOUND" };

  return { ok: true, status: mapRefreshStatus(instance) };
}

async function runCreatorRollupRefresh(
  prisma: PrismaClient,
  creatorId: string,
  now: Date,
  env: NodeJS.ProcessEnv
): Promise<number> {
  const lookbackDays = rollupLookbackDaysFromEnv(env);
  const since = new Date(now.getTime());
  since.setUTCDate(since.getUTCDate() - lookbackDays);
  since.setUTCHours(0, 0, 0, 0);

  const result = await computeDailyRollups(prisma, creatorId, {
    since,
    until: now,
    computedAt: now
  });
  return result.upserted;
}

export async function refreshRelayPlatformInstanceRollup(
  prisma: PrismaClient,
  instance: PlatformInstanceRow,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  const upserted = await runCreatorRollupRefresh(prisma, instance.creatorId, now, env);
  await touchPlatformInstanceLastRefreshed(prisma, instance.id, now);
  await prisma.platformInstance.update({
    where: { id: instance.id },
    data: { status: "active", updatedAt: now }
  });
  return upserted;
}

export async function requestPlatformInstanceManualRefresh(
  prisma: PrismaClient,
  relayCreatorId: string,
  platformInstanceId: string,
  options?: { now?: Date; env?: NodeJS.ProcessEnv }
): Promise<
  { ok: true; result: PlatformInstanceRefreshWire } | { ok: false; code: "NO_TENANT" | "NOT_FOUND" }
> {
  const creatorId = relayCreatorId.trim();
  const env = options?.env ?? process.env;
  const now = options?.now ?? new Date();

  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId: creatorId },
    select: { id: true }
  });
  if (!tenant) return { ok: false, code: "NO_TENANT" };

  const instance = await loadOwnedPlatformInstance(prisma, creatorId, platformInstanceId);
  if (!instance) return { ok: false, code: "NOT_FOUND" };

  const base: Omit<PlatformInstanceRefreshWire, "status" | "method" | "handoff" | "cooldown" | "rollup_upserted" | "message"> = {
    platform_instance_id: instance.id,
    destination: instance.destination,
    last_refreshed_at: instance.lastRefreshedAt?.toISOString() ?? null,
    last_manual_refresh_requested_at: instance.lastManualRefreshRequestedAt?.toISOString() ?? null
  };

  if (instance.refreshPolicy === REFRESH_POLICY_DISABLED) {
    return {
      ok: true,
      result: {
        ...base,
        status: "disabled",
        method: null,
        handoff: null,
        cooldown: null,
        rollup_upserted: null,
        message: "Refresh is disabled for this platform instance."
      }
    };
  }

  const cooldown = evaluatePlatformInstanceRefreshCooldown(instance, now, env);
  if (cooldown.active) {
    return {
      ok: true,
      result: {
        ...base,
        status: "cooldown",
        method: null,
        handoff: null,
        cooldown: {
          retry_after_seconds: cooldown.retryAfterSeconds,
          next_allowed_at: cooldown.nextAllowedAt?.toISOString() ?? now.toISOString()
        },
        rollup_upserted: null,
        message: "Manual refresh is on cooldown for this destination."
      }
    };
  }

  if (instance.destination === "relay") {
    await prisma.platformInstance.update({
      where: { id: instance.id },
      data: { lastManualRefreshRequestedAt: now, updatedAt: now }
    });
    base.last_manual_refresh_requested_at = now.toISOString();

    const upserted = await refreshRelayPlatformInstanceRollup(prisma, instance, now, env);
    return {
      ok: true,
      result: {
        ...base,
        status: "completed",
        method: "relay_engagement_rollup",
        handoff: null,
        cooldown: null,
        rollup_upserted: upserted,
        last_refreshed_at: now.toISOString(),
        message: "Relay engagement metrics refreshed from first-party events."
      }
    };
  }

  const externalUrl = instance.externalUrl?.trim() ?? "";
  const attemptId = instance.attemptId?.trim() ?? "";

  if (!EXTENSION_HANDOFF_DESTINATIONS.has(instance.destination)) {
    if (instance.externalUrl?.trim()) {
      return {
        ok: true,
        result: {
          ...base,
          status: "unsupported_destination",
          method: null,
          handoff: null,
          cooldown: null,
          rollup_upserted: null,
          message: "Manual extension refresh is not supported for this destination yet."
        }
      };
    }

    return {
      ok: true,
      result: {
        ...base,
        status: "missing_link",
        method: null,
        handoff: null,
        cooldown: null,
        rollup_upserted: null,
        message: "No linked platform URL — link the post before refreshing external metrics."
      }
    };
  }

  await prisma.platformInstance.update({
    where: { id: instance.id },
    data: { lastManualRefreshRequestedAt: now, updatedAt: now }
  });
  base.last_manual_refresh_requested_at = now.toISOString();

  if (externalUrl && attemptId) {
    return {
      ok: true,
      result: {
        ...base,
        status: "handoff_required",
        method: "extension_dom",
        handoff: {
          post_id: instance.postId,
          attempt_id: attemptId,
          destination: instance.destination,
          external_url: externalUrl
        },
        cooldown: null,
        rollup_upserted: null,
        message:
          "Open the Relay extension handoff to capture fresh platform metrics (API preferred when available)."
      }
    };
  }

  const upserted = await runCreatorRollupRefresh(prisma, creatorId, now, env);
  return {
    ok: true,
    result: {
      ...base,
      status: externalUrl ? "missing_link" : "completed",
      method: "csv_rollup_overlay",
      handoff: null,
      cooldown: null,
      rollup_upserted: upserted,
      message: externalUrl
        ? "Linked attempt is missing — only CSV/rollup overlay was applied."
        : "Applied Patreon Insights CSV rollup overlay."
    }
  };
}
