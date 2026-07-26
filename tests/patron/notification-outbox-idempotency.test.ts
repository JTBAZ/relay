/**
 * P1-queue-015 — notification outbox tick idempotency (concurrent delivery simulation).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createOrClusterNotification } from "../../src/patron/notification-service.js";

describe("notifications_nonclustered_source_recipient migration", () => {
  it("defines partial unique index on source_event_id + recipient where cluster_key is null", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const sql = readFileSync(
      join(
        root,
        "prisma",
        "migrations",
        "20260508160000_notifications_nonclustered_source_recipient_unique",
        "migration.sql"
      ),
      "utf8"
    );
    expect(sql).toMatch(/CREATE UNIQUE INDEX/i);
    expect(sql.toLowerCase()).toContain("cluster_key");
    expect(sql).toMatch(/source_event_id/);
    expect(sql).toMatch(/recipient_membership_id/);
  });
});

describe("createOrClusterNotification concurrent non-clustered", () => {
  it("second parallel attempt maps to same row when first insert wins (P2002 path)", async () => {
    const row = {
      id: "n1",
      recipientMembershipId: "m1",
      relayCreatorId: "c1",
      kind: "tier_changed" as const,
      payloadJson: { ok: true },
      clusterKey: null,
      clusterCount: 1,
      sourceEventId: "src1",
      readAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    let inserter: Promise<typeof row> | null = null;
    const create = vi.fn(async () => {
      if (inserter) {
        await inserter;
        throw Object.assign(new Error("Unique"), { code: "P2002" });
      }
      inserter = Promise.resolve(row);
      await inserter;
      return row;
    });
    const findFirst = vi.fn().mockResolvedValue(row);
    const prisma = {
      notification: { create, findFirst, update: vi.fn() }
    } as never;
    const input = {
      recipientMembershipId: "m1",
      relayCreatorId: "c1",
      kind: "tier_changed" as const,
      payload: { ok: true },
      clusterKey: null as string | null,
      sourceEventId: "src1"
    };
    const [a, b] = await Promise.all([
      createOrClusterNotification(prisma, input),
      createOrClusterNotification(prisma, input)
    ]);
    expect(a.id).toBe("n1");
    expect(b.id).toBe("n1");
    expect(create).toHaveBeenCalledTimes(2);
  });
});
