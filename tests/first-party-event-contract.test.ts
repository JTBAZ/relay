import { describe, expect, it } from "vitest";
import {
  FIRST_PARTY_EVENT_DEFINITIONS,
  getFirstPartyEventDefinition,
  listFirstPartyEventNames,
  validateFirstPartyEventPayload
} from "../src/platform-metrics/first-party-event-contract.js";
import { getMetricRegistrySeed } from "../src/platform-metrics/metric-registry-seed.js";

describe("first-party event contract (PMD-040)", () => {
  it("defines all core Phase 4 events", () => {
    const names = listFirstPartyEventNames();
    for (const required of [
      "page_view",
      "session_start",
      "profile_view",
      "gallery_view",
      "feed_open",
      "post_view",
      "post_reveal",
      "analytics_viewed",
      "action_center_used",
      "follow_created",
      "favorite_created",
      "comment_created"
    ]) {
      expect(names).toContain(required);
    }
    expect(FIRST_PARTY_EVENT_DEFINITIONS.length).toBeGreaterThanOrEqual(14);
  });

  it("maps dashboard metric keys to registry seed", () => {
    const registryKeys = new Set(getMetricRegistrySeed().map((entry) => entry.key));
    for (const def of FIRST_PARTY_EVENT_DEFINITIONS) {
      for (const key of def.dashboardMetricKeys) {
        expect(registryKeys.has(key), `${def.name} → ${key}`).toBe(true);
      }
    }
  });

  it("validates required fields and rejects forbidden PII", () => {
    const profile = getFirstPartyEventDefinition("profile_view");
    expect(profile?.implementationStatus).toBe("live");

    const ok = validateFirstPartyEventPayload({
      eventName: "profile_view",
      payload: {
        occurred_at: "2026-05-24T19:00:00.000Z",
        creator_id: "creator_abc"
      }
    });
    expect(ok.valid).toBe(true);

    const bad = validateFirstPartyEventPayload({
      eventName: "comment_created",
      payload: {
        occurred_at: "2026-05-24T19:00:00.000Z",
        creator_id: "creator_abc",
        post_id: "post_1",
        comment_body: "hello"
      }
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.includes("comment_body"))).toBe(true);
  });

  it("documents dedupe and source surfaces for every event", () => {
    for (const def of FIRST_PARTY_EVENT_DEFINITIONS) {
      expect(def.dedupePosture.length).toBeGreaterThan(0);
      expect(def.sourceSurfaces.length).toBeGreaterThan(0);
      expect(def.privacyRules.length).toBeGreaterThan(0);
    }
  });
});
