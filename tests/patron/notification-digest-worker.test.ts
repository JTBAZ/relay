import { describe, expect, it, vi } from "vitest";
import { renderDigestEmail } from "../../src/patron/notification-digest-email.js";

describe("renderDigestEmail", () => {
  it("builds subject and links for multiple creators", () => {
    const rendered = renderDigestEmail({
      total_posts: 2,
      creators: [
        {
          relay_creator_id: "c1",
          display_name: "Ava",
          posts: [
            {
              post_id: "p1",
              title: "New sketch",
              published_at: "2026-05-28T12:00:00.000Z",
              href: "https://relay.test/patron/feed/post/c1/p1",
            },
          ],
        },
        {
          relay_creator_id: "c2",
          display_name: "Milo",
          posts: [
            {
              post_id: "p2",
              title: "Process reel",
              published_at: "2026-05-28T13:00:00.000Z",
              href: "https://relay.test/patron/feed/post/c2/p2",
            },
          ],
        },
      ],
    });
    expect(rendered.subject).toContain("2 creators");
    expect(rendered.text).toContain("Ava");
    expect(rendered.html).toContain("https://relay.test/patron/feed/post/c1/p1");
  });
});

describe("processNotificationDigestOnce", () => {
  it("skips patrons not in browse window", async () => {
    const { processNotificationDigestOnce } = await import(
      "../../src/patron/notification-digest-worker.js"
    );
    const prisma = {
      patronProfile: {
        findMany: vi.fn().mockResolvedValue([
          {
            notificationDigestEnabled: true,
            notificationDigestCadence: "weekly",
            notificationDigestSlot: "morning",
            notificationDigestTimezone: "UTC",
            tenantMembership: {
              id: "mem1",
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              account: { emailNorm: "patron@example.com" },
            },
          },
        ]),
      },
      notificationDigestRun: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    } as never;
    const stats = await processNotificationDigestOnce(prisma, {
      now: new Date("2026-05-28T18:00:00.000Z"),
    });
    expect(stats.skippedNotDue).toBe(1);
    expect(stats.sent).toBe(0);
  });
});
