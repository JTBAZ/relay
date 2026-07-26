import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { CoachProposeResult } from "../src/distribution/coach-propose-service.js";
import type { CoachFactPack } from "../src/distribution/coach-fact-pack.js";

vi.mock("../src/creator/creator-feature-flags-service.js", () => ({
  isPostingAssistantAllowedForCreator: vi.fn(async () => true)
}));

vi.mock("../src/ai/ai-service.js", () => ({
  generateText: vi.fn(async () => ({
    ok: false,
    error: { code: "disabled", message: "AI off" }
  }))
}));

import {
  assertCoachProposeAllowed,
  clearCoachReviewCheckpoint,
  finalizeAssistantPlanFromCheckpoint,
  patchCoachReviewProgress,
  saveCoachReviewCheckpoint
} from "../src/distribution/coach-checkpoint-service.js";
import { PostDistributionValidationError } from "../src/distribution/post-distribution-service.js";

function stubFactPack(): CoachFactPack {
  return {
    coverage: {
      as_of: new Date().toISOString(),
      range: "30d",
      stale: false,
      with_metrics: [],
      without_metrics: [],
      sources: []
    },
    this_post: null,
    destination_mix: [],
    tags: [],
    contrast: null,
    structure: null,
    insight_codes: [],
    goals: [],
    cadence: {
      monthly_post_target: 4,
      posts_this_month: 1,
      historical_hour_of_day: 19,
      sample_size: 5,
      timing_confidence: "high",
      timezone: "UTC"
    },
    reason_codes: []
  };
}

function stubProposal(): CoachProposeResult {
  return {
    path_id: "engage",
    findings: { chips: [{ id: "c1", label: "Signal", source: "goals" }] },
    by_destination: {
      x: {
        variants: [
          {
            id: "v1",
            formula_id: "hook_proof_cta",
            recommended: true,
            label: "Hook",
            fit_reason: "fit",
            title: null,
            body_text: "Hello X"
          }
        ]
      }
    },
    ai_used: false,
    facts: {
      historical_hour_of_day: 19,
      sample_size: 5,
      timing_confidence: "high",
      posts_this_month: 1,
      monthly_post_target: 4,
      timezone: "UTC"
    },
    fact_pack: stubFactPack()
  };
}

describe("coach-checkpoint-service", () => {
  const creatorId = "creator_1";
  const postId = "post_1";

  let plans: Map<string, Record<string, unknown>>;
  let prisma: PrismaClient;

  beforeEach(() => {
    plans = new Map();
    prisma = {
      post: {
        findFirst: vi.fn(async () => ({
          id: postId,
          creatorId,
          versions: [
            {
              title: "T",
              description: "D",
              mediaIds: [],
              tagIds: [],
              versionSeq: 1
            }
          ],
          presentation: null
        }))
      },
      postDistributionPlan: {
        findFirst: vi.fn(async (args: {
          where: { postId: string; status: string };
          include?: { _count?: unknown; variants?: unknown };
        }) => {
          for (const row of plans.values()) {
            if (
              row.postId === whereOr(args) &&
              row.creatorId === creatorId &&
              row.status === args.where.status
            ) {
              const base = {
                ...row,
                variants: [],
                _count: { variants: (row as { _variantCount?: number })._variantCount ?? 0 }
              };
              return base;
            }
          }
          return null;

          function whereOr(a: { where: { postId: string } }) {
            return a.where.postId;
          }
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const id = `plan_${plans.size + 1}`;
          const row = {
            id,
            creatorId: data.creatorId,
            postId: data.postId,
            status: data.status,
            assistantMode: data.assistantMode,
            assistantContext: data.assistantContext,
            assistantPlan: data.assistantPlan,
            createdAt: new Date(),
            updatedAt: new Date(),
            _variantCount: 0
          };
          plans.set(id, row);
          return row;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = plans.get(where.id);
          if (!row) throw new Error("missing");
          const next = { ...row, ...data, updatedAt: new Date() };
          plans.set(where.id, next);
          return next;
        })
      }
    } as unknown as PrismaClient;
  });

  it("saveCoachReviewCheckpoint creates coach_review stub with proposal and zero variants", async () => {
    const plan = await saveCoachReviewCheckpoint(prisma, creatorId, postId, {
      proposal: stubProposal(),
      assistant_context: { goals: ["engagement_optimization"] },
      coach_destinations: ["x"],
      coach_phase: "findings"
    });

    expect(plan.assistant_mode).toBe("coach_review");
    expect(plan.variants).toEqual([]);
    expect(plan.assistant_plan.coach_checkpoint_version).toBe(1);
    expect(plan.assistant_plan.coach_phase).toBe("findings");
    expect((plan.assistant_plan.proposal as { path_id: string }).path_id).toBe("engage");
  });

  it("patchCoachReviewProgress merges accepted copy and index", async () => {
    await saveCoachReviewCheckpoint(prisma, creatorId, postId, {
      proposal: stubProposal(),
      coach_destinations: ["x", "patreon"],
      coach_phase: "findings"
    });

    const plan = await patchCoachReviewProgress(prisma, creatorId, postId, {
      coach_phase: "platformReview",
      platform_review_index: 1,
      accepted_copy_by_destination: {
        x: { title: null, body_text: "Committed X", formula_id: "hook_value_cta", variant_id: "v1" }
      }
    });

    expect(plan.assistant_plan.coach_phase).toBe("platformReview");
    expect(plan.assistant_plan.platform_review_index).toBe(1);
    const accepted = plan.assistant_context.accepted_copy_by_destination as Record<
      string,
      { body_text: string }
    >;
    expect(accepted.x.body_text).toBe("Committed X");
  });

  it("assertCoachProposeAllowed blocks routed active plans", async () => {
    plans.set("routed", {
      id: "routed",
      creatorId,
      postId,
      status: "active",
      assistantMode: "completed_accepted",
      assistantContext: {},
      assistantPlan: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      _variantCount: 2
    });

    await expect(assertCoachProposeAllowed(prisma, creatorId, postId)).rejects.toBeInstanceOf(
      PostDistributionValidationError
    );
  });

  it("clearCoachReviewCheckpoint archives stub", async () => {
    const created = await saveCoachReviewCheckpoint(prisma, creatorId, postId, {
      proposal: stubProposal(),
      coach_destinations: ["x"]
    });
    const result = await clearCoachReviewCheckpoint(prisma, creatorId, postId);
    expect(result.archived).toBe(true);
    expect(result.plan_id).toBe(created.plan_id);
    expect(plans.get(created.plan_id)?.status).toBe("archived");
  });

  it("reload reconstructs proposal from GET plan without re-propose", async () => {
    const saved = await saveCoachReviewCheckpoint(prisma, creatorId, postId, {
      proposal: stubProposal(),
      assistant_context: { goals: ["engagement_optimization"], user_notes: "note" },
      coach_destinations: ["x"],
      coach_phase: "findings"
    });
    // Simulate page reload: only read back the active plan
    const { getPostDistributionPlan } = await import(
      "../src/distribution/post-distribution-service.js"
    );
    const reloaded = await getPostDistributionPlan(prisma, creatorId, postId);
    expect(reloaded?.plan_id).toBe(saved.plan_id);
    expect(reloaded?.assistant_mode).toBe("coach_review");
    expect(reloaded?.variants).toEqual([]);
    const proposal = reloaded?.assistant_plan.proposal as { path_id: string; findings: unknown };
    expect(proposal.path_id).toBe("engage");
    expect(proposal.findings).toBeTruthy();
  });

  it("Run Coach again archives old stub then creates a new one", async () => {
    const first = await saveCoachReviewCheckpoint(prisma, creatorId, postId, {
      proposal: stubProposal(),
      coach_destinations: ["x"]
    });
    await clearCoachReviewCheckpoint(prisma, creatorId, postId);
    expect(plans.get(first.plan_id)?.status).toBe("archived");

    const second = await saveCoachReviewCheckpoint(prisma, creatorId, postId, {
      proposal: { ...stubProposal(), path_id: "reach" },
      coach_destinations: ["x", "patreon"]
    });
    expect(second.plan_id).not.toBe(first.plan_id);
    expect(second.assistant_mode).toBe("coach_review");
    expect((second.assistant_plan.proposal as { path_id: string }).path_id).toBe("reach");
    expect(plans.get(first.plan_id)?.status).toBe("archived");
  });

  it("finalizeAssistantPlanFromCheckpoint drops proposal and fact_pack", () => {
    const cleaned = finalizeAssistantPlanFromCheckpoint(
      {
        coach_checkpoint_version: 1,
        coach_phase: "platformReview",
        platform_review_index: 0,
        coach_destinations: ["x"],
        proposal: { path_id: "engage" },
        fact_pack: { huge: true },
        facts: { timezone: "UTC" }
      },
      {
        goals: ["engagement_optimization"],
        accepted_lock: true,
        facts: { timezone: "UTC", sample_size: 5 }
      }
    );
    expect(cleaned.proposal).toBeUndefined();
    expect(cleaned.fact_pack).toBeUndefined();
    expect(cleaned.coach_phase).toBeUndefined();
    expect(cleaned.accepted_lock).toBe(true);
    expect((cleaned.facts as { sample_size: number }).sample_size).toBe(5);
  });
});
