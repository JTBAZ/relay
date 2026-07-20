/**
 * Acceptance: Coach finalize upgrades coach_review stub in place (same plan_id),
 * rolls back on mid-transaction failure, and does not clobber routed plans.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PostSource, PostUpstreamStatus } from "@prisma/client";

vi.mock("../src/creator/creator-feature-flags-service.js", () => ({
  isPostingAssistantAllowedForCreator: vi.fn(async () => true)
}));

vi.mock("../src/ai/ai-service.js", () => ({
  generateText: vi.fn(async () => ({
    ok: false,
    error: { code: "disabled", message: "AI off" }
  }))
}));

import { isPostingAssistantAllowedForCreator } from "../src/creator/creator-feature-flags-service.js";
import { createPostDistributionPlan } from "../src/distribution/post-distribution-service.js";

type PlanRow = {
  id: string;
  creatorId: string;
  postId: string;
  status: string;
  assistantMode: string;
  assistantContext: Record<string, unknown>;
  assistantPlan: Record<string, unknown>;
  sourceDraftId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type VariantRow = {
  id: string;
  planId: string;
  postId: string;
  creatorId: string;
  destination: string;
  status: string;
  assistantEnabled: boolean;
  title: string | null;
  bodyText: string | null;
  postText: string | null;
  tags: string[];
  locale: string | null;
  scheduledFor: Date | null;
  remindMe: boolean;
  reminderSentAt: Date | null;
  platformFields: Record<string, unknown>;
  advice: Record<string, unknown>;
  approvedAt: Date | null;
};

describe("createPostDistributionPlan — coach_review finalize", () => {
  const creatorId = "creator_1";
  const postId = "post_1";
  const stubPlanId = "plan_stub_1";

  let plans: Map<string, PlanRow>;
  let variants: Map<string, VariantRow>;
  let failNextVariantCreate: boolean;
  let prisma: PrismaClient;

  function seedCoachStub() {
    plans.set(stubPlanId, {
      id: stubPlanId,
      creatorId,
      postId,
      status: "active",
      assistantMode: "coach_review",
      assistantContext: {
        goals: ["engagement_optimization", "format_optimization"]
      },
      assistantPlan: {
        coach_checkpoint_version: 1,
        coach_phase: "platformReview",
        platform_review_index: 0,
        coach_destinations: ["x"],
        proposal: {
          path_id: "engage",
          findings: { chips: [] },
          by_destination: {},
          ai_used: false,
          facts: {},
          fact_pack: { huge: true }
        },
        facts: { timezone: "UTC" }
      },
      sourceDraftId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  function snapshotState() {
    return {
      plans: new Map(
        [...plans.entries()].map(([k, v]) => [k, structuredClone(v)])
      ),
      variants: new Map(
        [...variants.entries()].map(([k, v]) => [k, structuredClone(v)])
      )
    };
  }

  function restoreState(snap: ReturnType<typeof snapshotState>) {
    plans.clear();
    variants.clear();
    for (const [k, v] of snap.plans) plans.set(k, v);
    for (const [k, v] of snap.variants) variants.set(k, v);
  }

  function buildTx() {
    return {
      postDistributionPlan: {
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = plans.get(where.id);
          if (!row) throw new Error("plan missing");
          const next = { ...row, ...data, updatedAt: new Date() } as PlanRow;
          plans.set(where.id, next);
          return next;
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const id = `plan_new_${plans.size + 1}`;
          const row: PlanRow = {
            id,
            creatorId: String(data.creatorId),
            postId: String(data.postId),
            status: String(data.status),
            assistantMode: String(data.assistantMode),
            assistantContext: (data.assistantContext as Record<string, unknown>) ?? {},
            assistantPlan: (data.assistantPlan as Record<string, unknown>) ?? {},
            sourceDraftId: (data.sourceDraftId as string | null) ?? null,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          plans.set(id, row);
          return row;
        }),
        findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
          const row = plans.get(where.id);
          if (!row) throw new Error("missing plan");
          const planVariants = [...variants.values()].filter((v) => v.planId === where.id);
          return {
            ...row,
            variants: planVariants.map((v) => ({
              ...v,
              attempts: [],
              postbotTasks: []
            }))
          };
        })
      },
      postDistributionVariant: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (failNextVariantCreate) {
            failNextVariantCreate = false;
            throw new Error("injected variant create failure");
          }
          const id = `var_${variants.size + 1}`;
          const row: VariantRow = {
            id,
            planId: String(data.planId),
            postId: String(data.postId),
            creatorId: String(data.creatorId),
            destination: String(data.destination),
            status: String(data.status),
            assistantEnabled: Boolean(data.assistantEnabled),
            title: (data.title as string | null) ?? null,
            bodyText: (data.bodyText as string | null) ?? null,
            postText: (data.postText as string | null) ?? null,
            tags: (data.tags as string[]) ?? [],
            locale: null,
            scheduledFor: null,
            remindMe: false,
            reminderSentAt: null,
            platformFields: (data.platformFields as Record<string, unknown>) ?? {},
            advice: (data.advice as Record<string, unknown>) ?? {},
            approvedAt: null
          };
          variants.set(id, row);
          return row;
        })
      },
      postbotTask: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const now = new Date();
          return {
            id: `task_${Math.random().toString(16).slice(2)}`,
            creatorId: data.creatorId,
            postId: data.postId,
            planId: data.planId,
            variantId: data.variantId,
            destination: data.destination,
            action: data.action,
            status: "pending",
            rationale: data.rationale,
            suggestedTime: data.suggestedTime ?? null,
            link: data.link ?? null,
            createdAt: now,
            updatedAt: now
          };
        })
      }
    };
  }

  beforeEach(() => {
    vi.mocked(isPostingAssistantAllowedForCreator).mockResolvedValue(true);
    plans = new Map();
    variants = new Map();
    failNextVariantCreate = false;
    seedCoachStub();

    const tx = buildTx();
    prisma = {
      post: {
        findFirst: vi.fn(async () => ({
          id: postId,
          creatorId,
          source: PostSource.RELAY,
          upstreamStatus: PostUpstreamStatus.active,
          versions: [
            {
              title: "Studio piece",
              description: "Full description",
              mediaIds: [],
              tagIds: [],
              versionSeq: 1
            }
          ],
          presentation: null
        })),
        count: vi.fn(async () => 1),
        findMany: vi.fn(async () => [])
      },
      creatorPostingGoal: {
        findUnique: vi.fn(async () => ({ monthlyPostTarget: 4, timezone: "UTC" }))
      },
      postDistributionAttempt: {
        findMany: vi.fn(async () => [])
      },
      postDistributionPlan: {
        findFirst: vi.fn(async ({ where }: { where: { postId: string; status: string } }) => {
          for (const row of plans.values()) {
            if (row.postId === where.postId && row.status === where.status) {
              return {
                ...row,
                _count: {
                  variants: [...variants.values()].filter((v) => v.planId === row.id).length
                }
              };
            }
          }
          return null;
        }),
        update: tx.postDistributionPlan.update,
        create: tx.postDistributionPlan.create,
        findUniqueOrThrow: tx.postDistributionPlan.findUniqueOrThrow
      },
      postDistributionVariant: tx.postDistributionVariant,
      postbotTask: tx.postbotTask,
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => {
        const snap = snapshotState();
        try {
          return await fn(tx);
        } catch (err) {
          restoreState(snap);
          throw err;
        }
      })
    } as unknown as PrismaClient;
  });

  it("finalize with accepted copy upgrades same plan_id and clears checkpoint fields", async () => {
    const plan = await createPostDistributionPlan(prisma, creatorId, postId, {
      destinations: ["x"],
      assistant_by_destination: { x: true },
      assistant_context: {
        goals: ["engagement_optimization", "format_optimization"],
        accepted_copy_by_destination: {
          x: {
            title: null,
            body_text: "Locked X copy",
            formula_id: "hook_proof_cta",
            variant_id: "x__hook_proof_cta"
          }
        }
      }
    });

    expect(plan.plan_id).toBe(stubPlanId);
    expect(plan.assistant_mode).toBe("completed_accepted");
    expect(plan.variants.length).toBe(1);
    expect(plan.variants[0]?.destination).toBe("x");
    expect(plan.assistant_plan.proposal).toBeUndefined();
    expect(plan.assistant_plan.coach_phase).toBeUndefined();
    expect(plan.assistant_plan.fact_pack).toBeUndefined();
    expect(plan.assistant_plan.accepted_lock).toBe(true);
    // Stub was not archived as a separate row
    expect([...plans.values()].filter((p) => p.status === "archived")).toHaveLength(0);
  });

  it("finalize failure mid-transaction leaves coach_review stub intact for retry", async () => {
    failNextVariantCreate = true;

    await expect(
      createPostDistributionPlan(prisma, creatorId, postId, {
        destinations: ["x"],
        assistant_by_destination: { x: true },
        assistant_context: {
          goals: ["engagement_optimization"],
          accepted_copy_by_destination: {
            x: { body_text: "Will fail before persist" }
          }
        }
      })
    ).rejects.toThrow(/injected variant create failure/);

    const stub = plans.get(stubPlanId);
    expect(stub?.status).toBe("active");
    expect(stub?.assistantMode).toBe("coach_review");
    expect(stub?.assistantPlan.proposal).toBeTruthy();
    expect([...variants.values()].filter((v) => v.planId === stubPlanId)).toHaveLength(0);

    // Retry without re-propose succeeds on same plan_id
    const plan = await createPostDistributionPlan(prisma, creatorId, postId, {
      destinations: ["x"],
      assistant_by_destination: { x: true },
      assistant_context: {
        goals: ["engagement_optimization", "format_optimization"],
        accepted_copy_by_destination: {
          x: { body_text: "Retry locked copy", formula_id: "hook_proof_cta" }
        }
      }
    });
    expect(plan.plan_id).toBe(stubPlanId);
    expect(plan.assistant_mode).toBe("completed_accepted");
    expect(plan.variants).toHaveLength(1);
  });

  it("does not reuse a routed active plan (archives then creates new)", async () => {
    plans.set(stubPlanId, {
      id: stubPlanId,
      creatorId,
      postId,
      status: "active",
      assistantMode: "completed_accepted",
      assistantContext: {},
      assistantPlan: { accepted_lock: true },
      sourceDraftId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    variants.set("existing_var", {
      id: "existing_var",
      planId: stubPlanId,
      postId,
      creatorId,
      destination: "x",
      status: "draft",
      assistantEnabled: true,
      title: null,
      bodyText: null,
      postText: "old",
      tags: [],
      locale: null,
      scheduledFor: null,
      remindMe: false,
      reminderSentAt: null,
      platformFields: {},
      advice: {},
      approvedAt: null
    });

    const plan = await createPostDistributionPlan(prisma, creatorId, postId, {
      destinations: ["x"],
      assistant_by_destination: { x: true },
      assistant_context: {
        goals: ["engagement_optimization"],
        accepted_copy_by_destination: {
          x: { body_text: "New route copy" }
        }
      }
    });

    expect(plan.plan_id).not.toBe(stubPlanId);
    expect(plans.get(stubPlanId)?.status).toBe("archived");
    expect(plan.variants).toHaveLength(1);
  });
});
