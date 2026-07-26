/**
 * PMD-061 — Persist Relay-native revenue lifecycle events to platform_revenue_events.
 * @see docs/platform-revenue-telemetry-contract.md
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  PlatformRevenueEventKind,
  PlatformRevenueSourceLabel
} from "@prisma/client";
import type { CheckoutResult, TierProductMapping } from "../payments/types.js";
import {
  type RevenueEventKind,
  type RevenueSourceLabel,
  validateRevenueTelemetryEvent
} from "./revenue-telemetry-contract.js";

export type RevenueTelemetryWriterConfig = {
  prisma?: PrismaClient | null;
  relay_db_store_analytics?: boolean;
};

export type RecordPlatformRevenueEventInput = {
  event_kind: RevenueEventKind;
  source_label?: RevenueSourceLabel;
  occurred_at?: string;
  creator_id?: string;
  checkout_id?: string;
  subscription_id?: string;
  amount_cents?: number;
  net_amount_cents?: number;
  currency?: string;
  status?: string;
  provider?: string;
  payload?: Record<string, unknown>;
  trace_id?: string | null;
};

export type RecordPlatformRevenueEventResult =
  | { ok: true; event_id: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; errors: string[] };

function relayEnvTruthy(raw: string | undefined): boolean {
  if (raw == null || raw === "") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function analyticsWritesEnabled(cfg: RevenueTelemetryWriterConfig): boolean {
  if (typeof cfg.relay_db_store_analytics === "boolean") {
    return cfg.relay_db_store_analytics;
  }
  return relayEnvTruthy(process.env.RELAY_DB_STORE_ANALYTICS);
}

function toPrismaEventKind(kind: RevenueEventKind): PlatformRevenueEventKind {
  return kind as PlatformRevenueEventKind;
}

function toPrismaSourceLabel(label: RevenueSourceLabel): PlatformRevenueSourceLabel {
  return label as PlatformRevenueSourceLabel;
}

export async function recordPlatformRevenueEvent(
  cfg: RevenueTelemetryWriterConfig,
  input: RecordPlatformRevenueEventInput
): Promise<RecordPlatformRevenueEventResult> {
  const prisma = cfg.prisma;
  if (!prisma || !analyticsWritesEnabled(cfg)) {
    return {
      ok: false,
      skipped: true,
      reason: "Revenue telemetry storage unavailable (Prisma or RELAY_DB_STORE_ANALYTICS)."
    };
  }

  const body = {
    event_kind: input.event_kind,
    source_label: input.source_label ?? "relay_native",
    occurred_at: input.occurred_at ?? new Date().toISOString(),
    creator_id: input.creator_id,
    checkout_id: input.checkout_id,
    subscription_id: input.subscription_id,
    amount_cents: input.amount_cents,
    net_amount_cents: input.net_amount_cents,
    currency: input.currency,
    status: input.status,
    provider: input.provider,
    payload: input.payload ?? {}
  };

  const validation = validateRevenueTelemetryEvent(body);
  if (!validation.valid) {
    return { ok: false, skipped: false, errors: validation.errors };
  }

  const occurredAt = new Date(String(body.occurred_at));
  const row = await prisma.platformRevenueEvent.create({
    data: {
      eventKind: toPrismaEventKind(input.event_kind),
      sourceLabel: toPrismaSourceLabel(body.source_label as RevenueSourceLabel),
      provider: input.provider ?? null,
      occurredAt,
      creatorId: input.creator_id ?? null,
      checkoutId: input.checkout_id ?? null,
      subscriptionId: input.subscription_id ?? null,
      amountCents: input.amount_cents ?? null,
      netAmountCents: input.net_amount_cents ?? null,
      currency: input.currency ?? "USD",
      status: input.status ?? null,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      traceId: input.trace_id?.trim() || null
    }
  });

  return { ok: true, event_id: row.id };
}

export function schedulePlatformRevenueEvent(
  cfg: RevenueTelemetryWriterConfig,
  input: RecordPlatformRevenueEventInput
): void {
  void recordPlatformRevenueEvent(cfg, input).catch(() => {});
}

export async function recordCheckoutRevenueTelemetry(args: {
  cfg: RevenueTelemetryWriterConfig;
  phase: "started" | "completed" | "failed";
  creatorId: string;
  mapping: TierProductMapping;
  result?: CheckoutResult;
  traceId?: string | null;
}): Promise<void> {
  const { cfg, creatorId, mapping, traceId } = args;
  const base = {
    creator_id: creatorId,
    provider: mapping.provider,
    currency: mapping.currency,
    trace_id: traceId
  };

  if (args.phase === "started") {
    await recordPlatformRevenueEvent(cfg, {
      ...base,
      event_kind: "checkout_started",
      status: "started",
      payload: {
        tier_id: mapping.tier_id,
        billing_interval: mapping.billing_interval,
        dry_run: args.result?.dry_run ?? undefined
      }
    });
    return;
  }

  const result = args.result;
  if (!result) return;

  const checkoutBase = {
    ...base,
    checkout_id: result.checkout_id,
    amount_cents: result.amount_cents,
    occurred_at: result.processed_at,
    payload: {
      tier_id: result.tier_id,
      dry_run: result.dry_run,
      billing_interval: mapping.billing_interval,
      ...(result.error_message ? { error_message: result.error_message } : {})
    }
  };

  if (args.phase === "failed" || result.status === "failed") {
    await recordPlatformRevenueEvent(cfg, {
      ...checkoutBase,
      event_kind: "checkout_failed",
      status: result.status
    });
    return;
  }

  await recordPlatformRevenueEvent(cfg, {
    ...checkoutBase,
    event_kind: "checkout_completed",
    status: "success"
  });

  if (mapping.billing_interval === "month" || mapping.billing_interval === "year") {
    await recordPlatformRevenueEvent(cfg, {
      ...checkoutBase,
      event_kind: "subscription_created",
      subscription_id: `sub_${result.checkout_id}`,
      status: "active",
      payload: {
        tier_id: result.tier_id,
        billing_interval: mapping.billing_interval,
        dry_run: result.dry_run
      }
    });
  }
}

export async function recordSubscriptionRevenueTelemetry(args: {
  cfg: RevenueTelemetryWriterConfig;
  event_kind: Extract<
    RevenueEventKind,
    "subscription_upgraded" | "subscription_downgraded" | "subscription_canceled" | "refund_issued"
  >;
  creator_id: string;
  subscription_id: string;
  amount_cents?: number;
  currency?: string;
  provider?: string;
  status?: string;
  checkout_id?: string;
  payload?: Record<string, unknown>;
  trace_id?: string | null;
}): Promise<RecordPlatformRevenueEventResult> {
  return recordPlatformRevenueEvent(args.cfg, {
    event_kind: args.event_kind,
    creator_id: args.creator_id,
    subscription_id: args.subscription_id,
    amount_cents: args.amount_cents,
    currency: args.currency,
    provider: args.provider,
    status: args.status,
    checkout_id: args.checkout_id,
    payload: args.payload,
    trace_id: args.trace_id
  });
}
