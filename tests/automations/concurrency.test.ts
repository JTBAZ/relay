/**
 * AUT-VS8-T01 — Concurrent delivery races (B19).
 * Parallel workers must not duplicate runs/drafts/attention events.
 *
 * @see docs/qa/AUTOMATIONS_ACCEPTANCE.md (AU-04, AU-06, AU-12)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrGetAutomationRunForOccurrence } from "../../src/autopost/automation-reconcile-service.js";
import {
  ensureAutomationAttentionEventForRun,
  deliverAutomationNotificationIntent
} from "../../src/autopost/automation-attention-service.js";
import { automationRunIdempotencyKeyForOccurrence } from "../../src/autopost/automation-contract.js";
import { AUTOMATIONS_QA_PERSONA, AUTOMATIONS_QA_POSTS } from "./fixtures.js";

vi.mock("../../src/distribution/creator-schedule-event-service.js", () => ({
  createCreatorScheduleEvent: vi.fn(),
  CreatorScheduleEventValidationError: class CreatorScheduleEventValidationError extends Error {
    statusCode = 400;
  }
}));

vi.mock("../../src/patron/creator-notification-target.js", () => ({
  resolveCreatorAccountIdForRelayCreator: vi.fn()
}));

vi.mock("../../src/patron/notification-service.js", () => ({
  createOrClusterNotification: vi.fn()
}));

import { createCreatorScheduleEvent } from "../../src/distribution/creator-schedule-event-service.js";
import { resolveCreatorAccountIdForRelayCreator } from "../../src/patron/creator-notification-target.js";
import { createOrClusterNotification } from "../../src/patron/notification-service.js";

const mockedCreateEvent = vi.mocked(createCreatorScheduleEvent);
const mockedResolveAccount = vi.mocked(resolveCreatorAccountIdForRelayCreator);
const mockedNotify = vi.mocked(createOrClusterNotification);

const CREATOR = AUTOMATIONS_QA_PERSONA.creator_id;
const RULE = "rule_conc_1";
const OCC = "occ_conc_1";
const POST = AUTOMATIONS_QA_POSTS.newest_with_image.post_id;
const PUBLISHED = new Date(AUTOMATIONS_QA_POSTS.newest_with_image.published_at);
const RUN = "run_conc_1";
const DRAFT = "draft_conc_1";
const EVENT = "evt_conc_1";
const ACCOUNT = "acct_conc_1";

function createRunMemory() {
  let seq = 0;
  const nextId = (p: string) => `${p}_${++seq}`;
  const runs = new Map<
    string,
    {
      id: string;
      ruleId: string;
      creatorId: string;
      sourcePostId: string;
      idempotencyKey: string;
      scheduleOccurrenceId: string | null;
      status: string;
      draftId: string | null;
    }
  >();
  let createGate: Promise<void> | null = null;
  let releaseGate: (() => void) | null = null;

  const prisma = {
    creatorDistributionRuleRun: {
      findUnique: vi.fn(
        async ({
          where
        }: {
          where:
            | { idempotencyKey: string }
            | { ruleId_sourcePostId: { ruleId: string; sourcePostId: string } };
        }) => {
          if (createGate) await createGate;
          if ("idempotencyKey" in where) {
            for (const row of runs.values()) {
              if (row.idempotencyKey === where.idempotencyKey) return row;
            }
            return null;
          }
          const pair = where.ruleId_sourcePostId;
          for (const row of runs.values()) {
            if (row.ruleId === pair.ruleId && row.sourcePostId === pair.sourcePostId) {
              return row;
            }
          }
          return null;
        }
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (createGate) await createGate;
        const key = data.idempotencyKey as string;
        for (const row of runs.values()) {
          if (row.idempotencyKey === key) {
            throw new Error("Unique constraint failed on idempotency_key");
          }
          if (row.ruleId === data.ruleId && row.sourcePostId === data.sourcePostId) {
            throw new Error("Unique constraint failed on ruleId_sourcePostId");
          }
        }
        const row = {
          id: nextId("run"),
          ruleId: data.ruleId as string,
          creatorId: data.creatorId as string,
          sourcePostId: data.sourcePostId as string,
          idempotencyKey: key,
          scheduleOccurrenceId: (data.scheduleOccurrenceId as string) ?? null,
          status: (data.status as string) ?? "pending",
          draftId: null
        };
        runs.set(row.id, row);
        return row;
      })
    }
  };

  return {
    prisma: prisma as any,
    runs,
    /** Hold concurrent creates until release so both pass the initial findUnique miss. */
    armCreateGate() {
      createGate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
    },
    releaseCreateGate() {
      releaseGate?.();
      createGate = null;
      releaseGate = null;
    }
  };
}

describe("concurrent run create (AU-04)", () => {
  it("Promise.all dual createOrGet yields one run via unique recovery", async () => {
    const mem = createRunMemory();
    const args = {
      creatorId: CREATOR,
      distributionRuleId: RULE,
      occurrenceId: OCC,
      sourcePostId: POST,
      sourcePublishedAt: PUBLISHED,
      dueAt: new Date("2026-07-20T14:00:00.000Z")
    };

    mem.armCreateGate();
    const p1 = createOrGetAutomationRunForOccurrence(mem.prisma, args);
    const p2 = createOrGetAutomationRunForOccurrence(mem.prisma, args);
    // Let both enter create after a missed findUnique.
    await Promise.resolve();
    mem.releaseCreateGate();
    const [a, b] = await Promise.all([p1, p2]);

    expect(a.run_id).toBe(b.run_id);
    expect(mem.runs.size).toBe(1);
    expect(a.idempotency_key).toBe(automationRunIdempotencyKeyForOccurrence(OCC));
  });
});

describe("concurrent attention event (AU-06/AU-07)", () => {
  beforeEach(() => {
    mockedCreateEvent.mockReset();
    mockedResolveAccount.mockReset();
    mockedNotify.mockReset();
  });

  it("dual ensureAutomationAttentionEventForRun reuses one event id", async () => {
    let materializedEventId: string | null = null;
    let createCount = 0;
    const events = new Map<string, { id: string }>();

    mockedCreateEvent.mockImplementation(async () => {
      createCount += 1;
      events.set(EVENT, { id: EVENT });
      return { ok: true, event: { id: EVENT } as never };
    });

    const prisma = {
      creatorDistributionRuleRun: {
        findFirst: vi.fn(async () => ({
          id: RUN,
          draftId: DRAFT,
          dueAt: new Date("2026-07-20T14:00:00.000Z"),
          status: "materialized",
          ruleId: RULE,
          sourcePostId: POST,
          expiresAt: new Date("2026-07-23T14:00:00.000Z"),
          materializedEventId,
          rule: { remindMe: true, title: "Rule" }
        })),
        findUnique: vi.fn(async () => ({
          materializedEventId
        })),
        updateMany: vi.fn(async ({ data }: { data: { materializedEventId: string } }) => {
          if (materializedEventId != null) {
            return { count: 0 };
          }
          materializedEventId = data.materializedEventId;
          return { count: 1 };
        })
      },
      creatorScheduleEvent: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
          events.get(where.id) ?? null
        )
      },
      creatorAutomation: {
        findFirst: vi.fn(async () => ({
          id: "auto_conc_1",
          title: "Weekly",
          presetKind: "preview_crosspost"
        }))
      }
    } as any;

    // First call creates; second should reuse after update.
    const first = await ensureAutomationAttentionEventForRun(prisma, {
      creatorId: CREATOR,
      runId: RUN
    });
    expect(first?.event_id).toBe(EVENT);
    expect(first?.created).toBe(true);
    expect(createCount).toBe(1);

    const [a, b] = await Promise.all([
      ensureAutomationAttentionEventForRun(prisma, { creatorId: CREATOR, runId: RUN }),
      ensureAutomationAttentionEventForRun(prisma, { creatorId: CREATOR, runId: RUN })
    ]);
    expect(a?.event_id).toBe(EVENT);
    expect(b?.event_id).toBe(EVENT);
    expect(createCount).toBe(1);
  });
});

describe("concurrent notification deliver (AU-05/AU-12)", () => {
  beforeEach(() => {
    mockedResolveAccount.mockReset();
    mockedNotify.mockReset();
    mockedResolveAccount.mockResolvedValue(ACCOUNT);
    mockedNotify.mockResolvedValue({ id: "notif_1" } as never);
  });

  it("dual deliver of same skip intent uses once-ever sourceEventId", async () => {
    const intent = {
      kind: "automation_no_new_post" as const,
      creator_id: CREATOR,
      automation_id: "auto_conc_1",
      occurrence_id: OCC,
      dedupe_key: `automation_no_new_post:occurrence:${OCC}`
    };
    const prisma = {} as never;

    const [a, b] = await Promise.all([
      deliverAutomationNotificationIntent(prisma, intent),
      deliverAutomationNotificationIntent(prisma, intent)
    ]);

    expect(a).toEqual({ delivered: true, notification_id: "notif_1" });
    expect(b).toEqual({ delivered: true, notification_id: "notif_1" });
    expect(mockedNotify).toHaveBeenCalledTimes(2);
    const sourceIds = mockedNotify.mock.calls.map(
      (c) => (c[1] as { sourceEventId: string }).sourceEventId
    );
    expect(new Set(sourceIds)).toEqual(new Set([intent.dedupe_key]));
  });
});
