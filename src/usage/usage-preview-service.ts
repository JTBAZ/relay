/**
 * Creator-facing usage preview (P7 v0 / A14) — aggregates `UsageEvent` for the studio tenant.
 * Non-binding; see response `disclaimer`.
 */

import type { PrismaClient } from "@prisma/client";

export type UsagePreviewBarKind = "bytes" | "count";

export type UsagePreviewBar = {
  metric: string;
  label: string;
  quantity: string;
  kind: UsagePreviewBarKind;
};

export type CreatorUsagePreviewData = {
  window: { days: number; start: string; end: string };
  bars: UsagePreviewBar[];
  disclaimer: string;
};

const METRIC_CONFIG: Array<{ metric: string; label: string; kind: UsagePreviewBarKind }> = [
  { metric: "export.media.content.bytes", label: "Export: full media", kind: "bytes" },
  { metric: "export.media.thumb.bytes", label: "Export: thumbnails", kind: "bytes" },
  { metric: "export.media.preview.bytes", label: "Export: previews", kind: "bytes" },
  { metric: "export.library_zip.completed", label: "Library ZIP downloads", kind: "count" },
  { metric: "api.rate_limited", label: "API rate-limit hits (429)", kind: "count" }
];

export async function getCreatorUsagePreview(
  prisma: PrismaClient,
  relayCreatorId: string,
  days: number
): Promise<CreatorUsagePreviewData | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { relayCreatorId },
    select: { id: true }
  });
  if (!tenant) {
    return null;
  }

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.usageEvent.groupBy({
    by: ["metric"],
    where: {
      tenantId: tenant.id,
      occurredAt: { gte: start, lte: end },
      metric: { in: METRIC_CONFIG.map((m) => m.metric) }
    },
    _sum: { quantity: true }
  });

  const sums = new Map<string, bigint>();
  for (const r of rows) {
    const q = r._sum.quantity;
    sums.set(r.metric, q ?? 0n);
  }

  const bars: UsagePreviewBar[] = METRIC_CONFIG.map(({ metric, label, kind }) => {
    const quantity = sums.get(metric) ?? 0n;
    return { metric, label, kind, quantity: quantity.toString() };
  });

  return {
    window: {
      days,
      start: start.toISOString(),
      end: end.toISOString()
    },
    bars,
    disclaimer:
      "Beta estimates from Relay usage metering only. These are not invoices or binding usage — final billing may differ."
  };
}
