import { describe, expect, it, vi } from "vitest";
import {
  listIngestibleFirstPartyEventNames,
  validateFirstPartyIngestRequest
} from "../src/platform-metrics/first-party-event-contract.js";
import { ingestFirstPartyEvent } from "../src/platform-metrics/first-party-event-ingestion.js";

describe("validateFirstPartyIngestRequest (PMD-041)", () => {
  it("accepts a valid page_view envelope", () => {
    const result = validateFirstPartyIngestRequest({
      event_name: "page_view",
      occurred_at: "2026-05-24T19:00:00.000Z",
      producer: "web",
      session_key: "sess_opaque",
      payload: {
        surface: "patron_feed",
        path: "/patron/feed"
      }
    });
    expect(result.valid).toBe(true);
    expect(result.normalized?.eventName).toBe("page_view");
  });

  it("rejects domain-sourced events", () => {
    const result = validateFirstPartyIngestRequest({
      event_name: "follow_created",
      occurred_at: "2026-05-24T19:00:00.000Z",
      payload: { creator_id: "creator_1" }
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("domain-sourced"))).toBe(true);
  });

  it("rejects forbidden PII at envelope level", () => {
    const result = validateFirstPartyIngestRequest({
      event_name: "page_view",
      occurred_at: "2026-05-24T19:00:00.000Z",
      email: "patron@example.com",
      payload: { surface: "web", path: "/feed" }
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("email"))).toBe(true);
  });

  it("lists ingestible events excluding domain_table storage", () => {
    const names = listIngestibleFirstPartyEventNames();
    expect(names).toContain("page_view");
    expect(names).toContain("profile_view");
    expect(names).not.toContain("follow_created");
  });
});

describe("ingestFirstPartyEvent (PMD-041)", () => {
  it("returns STORAGE_UNAVAILABLE when prisma is missing", async () => {
    const outcome = await ingestFirstPartyEvent(
      { prisma: null, relay_db_store_analytics: true },
      {
        event_name: "page_view",
        occurred_at: "2026-05-24T19:00:00.000Z",
        payload: { surface: "web", path: "/feed" }
      }
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("STORAGE_UNAVAILABLE");
    }
  });

  it("persists platform telemetry rows", async () => {
    const create = vi.fn().mockResolvedValue({ id: "pte_1" });
    const outcome = await ingestFirstPartyEvent(
      {
        prisma: { platformTelemetryEvent: { create } } as never,
        relay_db_store_analytics: true
      },
      {
        event_name: "feed_open",
        occurred_at: "2026-05-24T19:00:00.000Z",
        actor_key: "acct_1",
        payload: {}
      },
      "trace_abc"
    );
    expect(outcome.ok).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventName: "feed_open",
          actorKey: "acct_1",
          traceId: "trace_abc"
        })
      })
    );
  });

  it("persists relay engagement rows for profile_view", async () => {
    const create = vi.fn().mockResolvedValue({ id: "ree_1" });
    const outcome = await ingestFirstPartyEvent(
      {
        prisma: { relayEngagementEvent: { create } } as never,
        relay_db_store_analytics: true
      },
      {
        event_name: "profile_view",
        occurred_at: "2026-05-24T19:00:00.000Z",
        payload: { creator_id: "creator_1", session_key: "sess_1" }
      }
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.storage).toBe("relay_engagement_events");
    }
    expect(create).toHaveBeenCalledWith({
      data: {
        creatorId: "creator_1",
        eventType: "profile_view",
        occurredAt: expect.any(Date) as Date,
        postId: null,
        mediaId: null,
        sessionKey: "sess_1"
      }
    });
  });
});
