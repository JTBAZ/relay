import { describe, expect, it } from "vitest";
import { buildPlatformMetricRegistry } from "../src/platform-metrics/platform-metric-registry-service.js";
import { getMetricRegistrySeed } from "../src/platform-metrics/metric-registry-seed.js";

describe("platform metric registry service (PMD-020/030)", () => {
  it("returns seeded metrics with coverage rollups", async () => {
    const registry = await buildPlatformMetricRegistry({
      prisma: undefined,
      pendingRetryJobs: 0,
      dlqRecordCount: 0
    });

    expect(registry.sections).toHaveLength(9);
    expect(registry.metrics).toHaveLength(getMetricRegistrySeed().length);
    expect(registry.coverage.total).toBe(registry.metrics.length);

    const total = registry.metrics.find((m) => m.key === "coverage.total_metrics");
    const productMetricCount = registry.metrics.filter(
      (m) => !m.key.startsWith("coverage.") && !m.key.startsWith("alerts.")
    ).length;
    expect(total?.status).toBe("live");
    expect(total?.value).toBe(productMetricCount);
  });

  it("wires platform ops health metrics without prisma", async () => {
    const registry = await buildPlatformMetricRegistry({
      prisma: undefined,
      pendingRetryJobs: 0,
      dlqRecordCount: 0
    });

    const dbConnectivity = registry.metrics.find((m) => m.key === "ops.db_connectivity");
    expect(dbConnectivity?.status).toBe("live");
    expect(dbConnectivity?.value).toBe(0);

    const ingestHealth = registry.metrics.find((m) => m.key === "ops.ingest_health");
    expect(ingestHealth?.status).toBe("live");
    expect(ingestHealth?.value).toBe("ok");
  });

  it("keeps deferred revenue metrics deferred", async () => {
    const registry = await buildPlatformMetricRegistry({
      prisma: undefined,
      pendingRetryJobs: 0,
      dlqRecordCount: 0
    });

    const mrr = registry.metrics.find((m) => m.key === "revenue.mrr");
    expect(mrr?.status).toBe("deferred");
    expect(mrr?.value).toBeNull();
  });
});
