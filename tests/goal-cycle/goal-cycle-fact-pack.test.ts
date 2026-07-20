import { describe, expect, it } from "vitest";
import {
  GOAL_CYCLE_FACT_PACK_VERSION,
  buildGoalCycleFactPack,
  buildGoalCycleFactPackFromDreamFixture,
  factPackEvidenceRefIds
} from "../../src/goal-cycle/planner/goal-cycle-fact-pack.js";
import { DREAM_FLOW_FIXTURE } from "../../src/goal-cycle/fixtures/dream-flow.js";

describe("VS5-T01 goal-cycle fact pack", () => {
  it("assembles a versioned Dream pack with precomputed metrics", () => {
    const pack = buildGoalCycleFactPackFromDreamFixture();
    expect(pack.version).toBe(GOAL_CYCLE_FACT_PACK_VERSION);
    expect(pack.cycle_id).toBe(DREAM_FLOW_FIXTURE.sample_cycle_summary.cycle_id);
    expect(pack.goal_kind).toBe("engagement");
    expect(pack.linked_destinations.map((d) => d.id)).toEqual(
      expect.arrayContaining(["patreon", "x", "bluesky"])
    );
    expect(pack.unlinked_destination_ids).toContain("deviantart");
    expect(pack.computed_metrics.history_post_count).toBe(
      DREAM_FLOW_FIXTURE.history.posts.length
    );
    expect(pack.computed_metrics.history_top_post_id).toBeTruthy();
    expect(pack.computed_metrics.cadence.sample_size).toBeGreaterThan(0);
    expect(pack.trend?.prompt_safe_summary).toBeTruthy();
    expect(pack.paid_support?.attribution).toBe("deterministic");
    expect(pack.evidence_refs.length).toBeGreaterThanOrEqual(3);
    expect(factPackEvidenceRefIds(pack).has("ev_history_top")).toBe(true);
  });

  it("strips raw trend excerpts and forbids patron identity", () => {
    const pack = buildGoalCycleFactPackFromDreamFixture();
    const blob = JSON.stringify(pack);
    expect(blob).not.toMatch(/patron_id|patreon_member|member_email|full_name/i);
    expect(blob).not.toMatch(/ignore previous instructions/i);
    expect(pack.trend).not.toHaveProperty("raw_provider_excerpt");
  });

  it("computes metrics before the model (history engagement ranking)", () => {
    const pack = buildGoalCycleFactPack({
      cycle_id: "cycle_metrics",
      goal_kind: "views",
      time_zone: "UTC",
      linked_destinations: [{ id: "patreon", readiness: "ready", label: "Patreon" }],
      history_posts: [
        {
          post_id: "p_low",
          published_at: "2026-07-01T12:00:00.000Z",
          title: "Low",
          destination: "patreon",
          likes: 1,
          comments: 0,
          views: 10
        },
        {
          post_id: "p_high",
          published_at: "2026-07-08T19:00:00.000Z",
          title: "High",
          destination: "x",
          likes: 40,
          comments: 10,
          views: 400
        }
      ],
      history_window_months: 3,
      computed_at: "2026-07-17T16:00:00.000Z"
    });
    expect(pack.computed_metrics.history_top_post_id).toBe("p_high");
    expect(pack.computed_metrics.cadence.preferred_local_hour).toBe(19);
    expect(pack.evidence_refs.some((e) => e.kind === "history")).toBe(true);
  });
});
