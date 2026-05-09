/**
 * @fileoverview M1-lite usage metering — append-only `UsageEvent` rows (P7-bill-002+).
 * @see docs/database/usage-events-rollups.md
 */

import type { PrismaClient } from "@prisma/client";
import type { Request } from "express";

export type EmitUsageInput = {
  tenantId?: string | null;
  relayCreatorId?: string | null;
  metric: string;
  quantity?: bigint | number;
  meta?: Record<string, unknown> | null;
  occurredAt?: Date;
};

let prismaGetter: (() => PrismaClient | null | undefined) | null = null;

/** Called once from `createApp` so rate-limit 429 handler can record metering without importing server config. */
export function registerUsageMeteringPrisma(get: () => PrismaClient | null | undefined): void {
  prismaGetter = get;
}

export function getRegisteredUsagePrisma(): PrismaClient | null | undefined {
  return prismaGetter?.();
}

type RequestWithRelayKey = Request & { relayRateLimitKey?: string };

export async function resolveTenantIdForRelayCreator(
  prisma: PrismaClient,
  relayCreatorId: string
): Promise<string | null> {
  const row = await prisma.tenant.findUnique({
    where: { relayCreatorId },
    select: { id: true }
  });
  return row?.id ?? null;
}

/** Best-effort insert; throws only on programmer error (callers may void/catch). */
export async function emitUsageEvent(
  prisma: PrismaClient | null | undefined,
  input: EmitUsageInput
): Promise<void> {
  if (!prisma) return;

  let tenantId = input.tenantId ?? null;
  if (!tenantId && input.relayCreatorId) {
    tenantId = await resolveTenantIdForRelayCreator(prisma, input.relayCreatorId);
  }

  const q = input.quantity ?? 1;
  const quantity = typeof q === "number" ? BigInt(Math.trunc(q)) : q;

  await prisma.usageEvent.create({
    data: {
      tenantId: tenantId ?? undefined,
      metric: input.metric,
      quantity,
      meta: input.meta === undefined || input.meta === null ? undefined : (input.meta as object),
      occurredAt: input.occurredAt
    }
  });
}

export function scheduleUsageEvent(
  prisma: PrismaClient | null | undefined,
  input: EmitUsageInput
): void {
  if (!prisma) return;
  void emitUsageEvent(prisma, input).catch(() => {});
}

/**
 * When express-rate-limit returns 429, record a discrete event; optional tenant via Account relay key.
 */
export async function emitRateLimit429ForRequest(
  prisma: PrismaClient | null | undefined,
  req: Request
): Promise<void> {
  if (!prisma) return;

  const key = (req as RequestWithRelayKey).relayRateLimitKey;
  let relayCreatorId: string | null = null;

  if (key) {
    const acc = await prisma.account.findUnique({
      where: { id: key },
      select: { primaryRelayCreatorId: true }
    });
    relayCreatorId = acc?.primaryRelayCreatorId ?? null;
  }

  await emitUsageEvent(prisma, {
    relayCreatorId,
    metric: "api.rate_limited",
    quantity: 1,
    meta: {
      path: req.path,
      method: req.method
    }
  });
}

export function scheduleRateLimit429ForRequest(
  prisma: PrismaClient | null | undefined,
  req: Request
): void {
  void emitRateLimit429ForRequest(prisma, req).catch(() => {});
}

const EXPORT_BYTES_METRICS = {
  content: "export.media.content.bytes",
  thumb: "export.media.thumb.bytes",
  preview: "export.media.preview.bytes"
} as const;

export type ExportMediaVariant = keyof typeof EXPORT_BYTES_METRICS;

export function scheduleExportMediaBytes(
  prisma: PrismaClient | null | undefined,
  relayCreatorId: string,
  variant: ExportMediaVariant,
  byteLength: number,
  extraMeta?: Record<string, unknown>
): void {
  if (!prisma || byteLength < 0) return;
  scheduleUsageEvent(prisma, {
    relayCreatorId,
    metric: EXPORT_BYTES_METRICS[variant],
    quantity: BigInt(byteLength),
    meta: { media_variant: variant, ...(extraMeta ?? {}) }
  });
}

export function scheduleLibraryZipUsage(
  prisma: PrismaClient | null | undefined,
  relayCreatorId: string,
  httpStatus: number
): void {
  if (!prisma) return;
  scheduleUsageEvent(prisma, {
    relayCreatorId,
    metric: "export.library_zip.completed",
    quantity: 1,
    meta: { http_status: httpStatus }
  });
}
