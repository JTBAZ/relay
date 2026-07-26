import { describe, expect, it, vi } from "vitest";
import {
  buildCreatorStudioTelemetryBody,
  emitCreatorStudioTelemetryEvent,
  shouldEmitCreatorStudioPageView
} from "./creator-studio-telemetry";

describe("creator studio telemetry (PMD-044)", () => {
  it("builds analytics_viewed payload with actor and creator ids", () => {
    const body = buildCreatorStudioTelemetryBody({
      event_name: "analytics_viewed",
      creator_id: "creator_1",
      actor_key: "acc_creator",
      surface: "creator_analytics"
    });

    expect(body.event_name).toBe("analytics_viewed");
    expect(body.actor_key).toBe("acc_creator");
    expect(body.payload).toMatchObject({
      creator_id: "creator_1",
      actor_key: "acc_creator",
      surface: "creator_analytics"
    });
  });

  it("dedupes page-view markers per session storage key", () => {
    const storage = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      }
    };

    expect(shouldEmitCreatorStudioPageView(sessionStorage, "relay.telemetry.analytics_viewed.emitted")).toBe(
      true
    );
    expect(shouldEmitCreatorStudioPageView(sessionStorage, "relay.telemetry.analytics_viewed.emitted")).toBe(
      false
    );
  });

  it("posts to platform metrics ingestion endpoint", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn().mockReturnValue("studio_session"),
        setItem: vi.fn()
      },
      sessionStorage: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn()
      }
    });

    emitCreatorStudioTelemetryEvent({
      event_name: "action_center_used",
      creator_id: "creator_1",
      actor_key: "acc_creator",
      surface: "creator_action_center",
      interaction: "accept",
      recommendation_id: "rec_1"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v1/platform-metrics/events");
    expect(JSON.parse(String(init.body))).toMatchObject({
      event_name: "action_center_used",
      payload: {
        creator_id: "creator_1",
        interaction: "accept",
        recommendation_id: "rec_1"
      }
    });
  });
});
