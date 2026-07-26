import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db.js";

/**
 * P5a-ins-001: GitHub Actions runs `npx prisma migrate deploy` on ephemeral Postgres, then `npm test`.
 * These assertions prove the P5a DDL is part of that chain (tables exist and are reachable).
 */
const isCi = process.env.CI === "true";

describe.skipIf(!isCi)("P5a-ins-001 — P5a tables after CI migrate deploy", () => {
  it("membership, insights, and engagement models are queryable (zero rows ok)", async () => {
    const [
      membership,
      imports,
      metrics,
      engagement
    ] = await Promise.all([
      prisma.creatorMembershipEvent.count(),
      prisma.patreonInsightsImport.count(),
      prisma.patreonInsightsPostMetric.count(),
      prisma.relayEngagementEvent.count()
    ]);
    expect(membership).toBeGreaterThanOrEqual(0);
    expect(imports).toBeGreaterThanOrEqual(0);
    expect(metrics).toBeGreaterThanOrEqual(0);
    expect(engagement).toBeGreaterThanOrEqual(0);
  });
});
