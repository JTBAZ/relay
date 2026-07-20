/**
 * VS11-T05 — rollback flag rehearsal + observability signal inventory (verification).
 * Does not invent health/pager alerts that are not implemented.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  getGoalCycleFeatureFlags,
  GoalCycleContractError
} from "../../src/goal-cycle/contracts.js";
import { goalCycleOutcomeRefreshRepeatEveryMsFromEnv } from "../../src/goal-cycle/outcomes/goal-cycle-outcome-worker.js";
import { approveAndMaterialize } from "../../src/goal-cycle/materialization/goal-cycle-materialization-service.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd());

describe("VS11-T05 Goal Cycle rollback / observability gates", () => {
  const prev = {
    enabled: process.env.RELAY_GOAL_CYCLE_ENABLED,
    ai: process.env.RELAY_GOAL_CYCLE_AI_ENABLED,
    trend: process.env.RELAY_GOAL_CYCLE_TREND_MODE,
    mat: process.env.RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED
  };

  afterEach(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore("RELAY_GOAL_CYCLE_ENABLED", prev.enabled);
    restore("RELAY_GOAL_CYCLE_AI_ENABLED", prev.ai);
    restore("RELAY_GOAL_CYCLE_TREND_MODE", prev.trend);
    restore("RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED", prev.mat);
  });

  it("defaults are fail-closed (off / fixture)", () => {
    delete process.env.RELAY_GOAL_CYCLE_ENABLED;
    delete process.env.RELAY_GOAL_CYCLE_AI_ENABLED;
    delete process.env.RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED;
    delete process.env.RELAY_GOAL_CYCLE_TREND_MODE;
    expect(getGoalCycleFeatureFlags({})).toEqual({
      enabled: false,
      ai_enabled: false,
      trend_mode: "fixture",
      materialization_enabled: false
    });
  });

  it("practical rollback: mat off refuses approve while master can stay on", async () => {
    process.env.RELAY_GOAL_CYCLE_ENABLED = "1";
    process.env.RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED = "false";
    await expect(
      approveAndMaterialize({} as never, {
        creatorId: "creator_a",
        cycleId: "cyc_1",
        approvalKey: "approve_test_key",
        expectedVersion: 1
      })
    ).rejects.toMatchObject({
      code: "GOAL_CYCLE_MATERIALIZATION_FAILED",
      details: expect.arrayContaining([
        expect.objectContaining({ field: "feature", issue: "materialization_disabled" })
      ])
    });
    expect(getGoalCycleFeatureFlags().enabled).toBe(true);
    expect(getGoalCycleFeatureFlags().materialization_enabled).toBe(false);
  });

  it("outcome refresh env kill-switch clears repeat schedule", () => {
    expect(
      goalCycleOutcomeRefreshRepeatEveryMsFromEnv({ RELAY_GOAL_CYCLE_OUTCOME_REFRESH_MS: "off" })
    ).toBeNull();
    expect(
      goalCycleOutcomeRefreshRepeatEveryMsFromEnv({ RELAY_GOAL_CYCLE_OUTCOME_REFRESH_MS: "0" })
    ).toBeNull();
  });

  it("runbook documents rollback + signal gaps", () => {
    const runbook = readFileSync(join(root, "docs/operations/goal-cycle-runbook.md"), "utf8");
    expect(runbook).toMatch(/MATERIALIZATION_ENABLED/);
    expect(runbook).toMatch(/preserve audit/i);
    expect(runbook).toMatch(/No.*health\/goal-cycle|none.*Goal Cycle/i);
    expect(runbook).toMatch(/VS10/);
    expect(runbook).toMatch(/credit drift/i);
  });

  it("materialization_disabled is a GoalCycleContractError", () => {
    const err = new GoalCycleContractError(
      "GOAL_CYCLE_MATERIALIZATION_FAILED",
      "Goal Cycle materialization is disabled.",
      [{ field: "feature", issue: "materialization_disabled" }]
    );
    expect(err.code).toBe("GOAL_CYCLE_MATERIALIZATION_FAILED");
  });
});
