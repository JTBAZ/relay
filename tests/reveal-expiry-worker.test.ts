/**
 * @fileoverview Reveal expiry worker tests (MB-13).
 */
import { describe, expect, it, vi } from "vitest";
import {
  revealExpiryRepeatEveryMsFromEnv,
  runRevealExpiryOnce
} from "../src/tips/reveal-expiry-worker.js";

vi.mock("../src/patron/notification-event-emit.js", () => ({
  emitNotificationOutboxEvent: vi.fn(async () => undefined)
}));

import { emitNotificationOutboxEvent } from "../src/patron/notification-event-emit.js";

describe("reveal-expiry-worker", () => {
  it("revealExpiryRepeatEveryMsFromEnv null when tips and premium off", () => {
    expect(revealExpiryRepeatEveryMsFromEnv({})).toBeNull();
  });

  it("closes expired reveals and notifies day-before once", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const closes: string[] = [];
    const prisma = {
      tipReveal: {
        findMany: vi.fn(async ({ where }: { where: { expiresAt?: { gt?: Date; lte?: Date } } }) => {
          if (where.expiresAt?.gt && where.expiresAt?.lte) {
            return [
              {
                id: "rev_soon",
                patronAccountId: "a1",
                creatorId: "c1",
                postId: "p1",
                expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000),
                closedAt: null
              }
            ];
          }
          return [
            {
              id: "rev_done",
              patronAccountId: "a1",
              creatorId: "c1",
              postId: "p2",
              expiresAt: new Date(now.getTime() - 1000),
              closedAt: null
            }
          ];
        }),
        update: vi.fn(async ({ where }: { where: { id: string } }) => {
          closes.push(where.id);
          return {};
        })
      },
      outboxEvent: {
        findFirst: vi.fn(async () => null)
      }
    } as never;

    const result = await runRevealExpiryOnce(prisma, { now });
    expect(result.notified).toBe(1);
    expect(result.closed).toBe(1);
    expect(closes).toEqual(["rev_done"]);
    expect(emitNotificationOutboxEvent).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        eventName: "tips.reveal_expiring",
        primaryId: "rev_soon"
      })
    );
  });

  it("skips notify when outbox already has tips.reveal_expiring for reveal", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const prisma = {
      tipReveal: {
        findMany: vi.fn(async ({ where }: { where: { expiresAt?: { gt?: Date; lte?: Date } } }) => {
          if (where.expiresAt?.gt && where.expiresAt?.lte) {
            return [
              {
                id: "rev_soon",
                patronAccountId: "a1",
                creatorId: "c1",
                postId: "p1",
                expiresAt: new Date(now.getTime() + 6 * 60 * 60 * 1000),
                closedAt: null
              }
            ];
          }
          return [];
        }),
        update: vi.fn()
      },
      outboxEvent: {
        findFirst: vi.fn(async () => ({ id: "obx_prior" }))
      }
    } as never;

    vi.mocked(emitNotificationOutboxEvent).mockClear();
    const result = await runRevealExpiryOnce(prisma, { now });
    expect(result.notified).toBe(0);
    expect(result.closed).toBe(0);
    expect(emitNotificationOutboxEvent).not.toHaveBeenCalled();
  });
});
