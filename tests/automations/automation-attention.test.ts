/**
 * AUT-VS5-T01/T02 — automation attention events, deep links, dismiss sync, notifications.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAutomationApprovalDeepLink,
  deliverAutomationNotificationIntent,
  dismissAutomationAttentionEventForRun,
  ensureAutomationAttentionEventForRun,
  ensureMissingAutomationAttentionEvents,
  syncAutomationAttentionEventToRunStatus
} from "../../src/autopost/automation-attention-service.js";
import { listDueScheduleReminders } from "../../src/distribution/schedule-reminder-extension-api.js";
import { reminderIdForManualEvent } from "../../src/distribution/creator-schedule-event-contract.js";
import { AUTOMATIONS_QA_PERSONA } from "./fixtures.js";

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

const mockedCreate = vi.mocked(createCreatorScheduleEvent);
const mockedResolveAccount = vi.mocked(resolveCreatorAccountIdForRelayCreator);
const mockedNotify = vi.mocked(createOrClusterNotification);
const CREATOR = AUTOMATIONS_QA_PERSONA.creator_id;
const RUN = "run_att_1";
const RULE = "rule_att_1";
const AUTO = "auto_att_1";
const DRAFT = "draft_att_1";
const EVENT = "evt_att_1";
const ACCOUNT = "acct_att_1";

describe("buildAutomationApprovalDeepLink", () => {
  it("builds opaque Studio query params only", () => {
    const url = buildAutomationApprovalDeepLink({
      draftId: DRAFT,
      runId: RUN,
      automationId: AUTO,
      env: { RELAY_PUBLIC_WEB_BASE_URL: "https://relay.example" }
    });
    expect(url).toBe(
      `https://relay.example/studio/autopost?draft_id=${DRAFT}&automation_run_id=${RUN}&automation_id=${AUTO}`
    );
    expect(url).not.toMatch(/media|body|caption/i);
  });
});

describe("ensureAutomationAttentionEventForRun", () => {
  beforeEach(() => {
    mockedCreate.mockReset();
  });

  it("reuses existing materializedEventId without creating", async () => {
    const prisma = {
      creatorDistributionRuleRun: {
        findFirst: vi.fn(async () => ({
          id: RUN,
          draftId: DRAFT,
          dueAt: new Date("2026-07-20T14:00:00.000Z"),
          status: "materialized",
          ruleId: RULE,
          sourcePostId: "post_1",
          expiresAt: new Date("2026-07-21T14:00:00.000Z"),
          materializedEventId: EVENT,
          rule: { remindMe: true, title: "Rule" }
        })),
        updateMany: vi.fn(),
        findUnique: vi.fn()
      },
      creatorAutomation: {
        findFirst: vi.fn(async () => ({ id: AUTO, title: "Weekly preview" }))
      },
      creatorScheduleEvent: {
        findFirst: vi.fn(async () => ({ id: EVENT, creatorId: CREATOR }))
      }
    };

    const result = await ensureAutomationAttentionEventForRun(prisma as never, {
      creatorId: CREATOR,
      runId: RUN
    });
    expect(result).toEqual({
      event_id: EVENT,
      created: false,
      deep_link: expect.stringContaining("automation_run_id=")
    });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("creates custom event and links materializedEventId", async () => {
    mockedCreate.mockResolvedValue({
      ok: true,
      event: { id: EVENT } as never
    });
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      creatorDistributionRuleRun: {
        findFirst: vi.fn(async () => ({
          id: RUN,
          draftId: DRAFT,
          dueAt: new Date("2026-07-20T14:00:00.000Z"),
          status: "materialized",
          ruleId: RULE,
          sourcePostId: "post_1",
          expiresAt: null,
          materializedEventId: null,
          rule: { remindMe: false, title: "Rule" }
        })),
        updateMany,
        findUnique: vi.fn(async () => ({ materializedEventId: EVENT }))
      },
      creatorAutomation: {
        findFirst: vi.fn(async () => ({ id: AUTO, title: "Crosspost preview" }))
      },
      creatorScheduleEvent: {
        findFirst: vi.fn()
      }
    };

    const result = await ensureAutomationAttentionEventForRun(prisma as never, {
      creatorId: CREATOR,
      runId: RUN
    });
    expect(result?.created).toBe(true);
    expect(result?.event_id).toBe(EVENT);
    expect(mockedCreate).toHaveBeenCalledWith(
      prisma,
      CREATOR,
      expect.objectContaining({
        event_type: "custom",
        remind_me: false,
        title: expect.stringContaining("Review Crosspost preview"),
        external_url: expect.stringContaining("/studio/autopost?")
      })
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: RUN, materializedEventId: null }),
        data: { materializedEventId: EVENT }
      })
    );
  });

  it("returns null when run is not automation-owned", async () => {
    const prisma = {
      creatorDistributionRuleRun: {
        findFirst: vi.fn(async () => ({
          id: RUN,
          draftId: DRAFT,
          dueAt: new Date("2026-07-20T14:00:00.000Z"),
          status: "materialized",
          ruleId: RULE,
          sourcePostId: "post_1",
          expiresAt: null,
          materializedEventId: null,
          rule: { remindMe: true, title: "Legacy" }
        }))
      },
      creatorAutomation: {
        findFirst: vi.fn(async () => null)
      }
    };
    await expect(
      ensureAutomationAttentionEventForRun(prisma as never, {
        creatorId: CREATOR,
        runId: RUN
      })
    ).resolves.toBeNull();
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

describe("ensureMissingAutomationAttentionEvents", () => {
  it("only creates for automation-owned runs", async () => {
    mockedCreate.mockResolvedValue({
      ok: true,
      event: { id: "evt_new" } as never
    });
    const prisma = {
      creatorDistributionRuleRun: {
        findMany: vi.fn(async () => [
          { id: "run_owned", ruleId: RULE },
          { id: "run_legacy", ruleId: "rule_legacy" }
        ]),
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id !== "run_owned") return null;
          return {
            id: "run_owned",
            draftId: DRAFT,
            dueAt: new Date("2026-07-20T14:00:00.000Z"),
            status: "materialized",
            ruleId: RULE,
            sourcePostId: "post_1",
            expiresAt: null,
            materializedEventId: null,
            rule: { remindMe: true, title: "Rule" }
          };
        }),
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => ({ materializedEventId: "evt_new" }))
      },
      creatorAutomation: {
        findFirst: vi.fn(async ({ where }: { where: { distributionRuleId: string } }) =>
          where.distributionRuleId === RULE ? { id: AUTO, title: "Owned" } : null
        )
      },
      creatorScheduleEvent: { findFirst: vi.fn() }
    };

    const created = await ensureMissingAutomationAttentionEvents(prisma as never, {
      creatorId: CREATOR,
      limit: 10
    });
    expect(created).toBe(1);
    expect(mockedCreate).toHaveBeenCalledTimes(1);
  });
});

describe("dismiss + sync attention event (B13)", () => {
  it("dismisses pending attention event idempotently", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      creatorDistributionRuleRun: {
        findFirst: vi.fn(async () => ({ materializedEventId: EVENT }))
      },
      creatorScheduleEvent: { updateMany }
    };
    const first = await dismissAutomationAttentionEventForRun(prisma as never, {
      creatorId: CREATOR,
      runId: RUN
    });
    expect(first).toEqual({ dismissed: true, event_id: EVENT });
    updateMany.mockResolvedValueOnce({ count: 0 });
    const second = await dismissAutomationAttentionEventForRun(prisma as never, {
      creatorId: CREATOR,
      runId: RUN
    });
    expect(second.dismissed).toBe(false);
  });

  it("syncs only terminal run statuses", async () => {
    const prisma = {
      creatorDistributionRuleRun: {
        findFirst: vi.fn(async () => ({ materializedEventId: EVENT }))
      },
      creatorScheduleEvent: {
        updateMany: vi.fn(async () => ({ count: 1 }))
      }
    };
    await expect(
      syncAutomationAttentionEventToRunStatus(prisma as never, {
        creatorId: CREATOR,
        runId: RUN,
        runStatus: "materialized"
      })
    ).resolves.toEqual({ dismissed: false, event_id: null });
    await expect(
      syncAutomationAttentionEventToRunStatus(prisma as never, {
        creatorId: CREATOR,
        runId: RUN,
        runStatus: "expired"
      })
    ).resolves.toEqual({ dismissed: true, event_id: EVENT });
  });
});

describe("deliverAutomationNotificationIntent (B13)", () => {
  beforeEach(() => {
    mockedResolveAccount.mockReset();
    mockedNotify.mockReset();
  });

  it("writes once-ever notification with dedupe sourceEventId", async () => {
    mockedResolveAccount.mockResolvedValue(ACCOUNT);
    mockedNotify.mockResolvedValue({ id: "notif_1" } as never);
    const prisma = {} as never;
    const intent = {
      kind: "automation_no_new_post" as const,
      creator_id: CREATOR,
      automation_id: AUTO,
      occurrence_id: "occ_1",
      dedupe_key: "automation_no_new_post:occurrence:occ_1"
    };
    const result = await deliverAutomationNotificationIntent(prisma, intent);
    expect(result).toEqual({ delivered: true, notification_id: "notif_1" });
    expect(mockedNotify).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        recipientCreatorAccountId: ACCOUNT,
        kind: "automation_no_new_post",
        clusterKey: null,
        sourceEventId: intent.dedupe_key,
        payload: expect.objectContaining({
          automation_id: AUTO,
          occurrence_id: "occ_1"
        })
      })
    );
    const payload = mockedNotify.mock.calls[0]![1].payload as Record<string, unknown>;
    expect(JSON.stringify(payload)).not.toMatch(/https?:\/\/.*(media|cdn)/i);
  });

  it("skips when creator account cannot be resolved", async () => {
    mockedResolveAccount.mockResolvedValue(null);
    await expect(
      deliverAutomationNotificationIntent({} as never, {
        kind: "automation_approval_expired",
        creator_id: CREATOR,
        automation_id: AUTO,
        run_id: RUN,
        dedupe_key: `automation_approval_expired:run:${RUN}`
      })
    ).resolves.toEqual({ delivered: false, notification_id: null });
    expect(mockedNotify).not.toHaveBeenCalled();
  });
});

describe("listDueScheduleReminders surfaces automation deep link (B13)", () => {
  it("emits schedule_reminder:manual: packet with approval CTA url", async () => {
    const deepLink = buildAutomationApprovalDeepLink({
      draftId: DRAFT,
      runId: RUN,
      automationId: AUTO,
      env: { RELAY_PUBLIC_WEB_BASE_URL: "https://relay.example" }
    });
    const now = new Date("2026-07-20T15:00:00.000Z");
    const prisma = {
      creatorPostingGoal: {
        findUnique: vi.fn(async () => ({
          remindMeGlobal: true
        }))
      },
      postbotTask: {
        findMany: vi.fn(async () => [])
      },
      creatorScheduleEvent: {
        findMany: vi.fn(async () => [
          {
            id: EVENT,
            eventType: "custom",
            title: "Review Crosspost preview preview",
            note: `automation_run:${RUN}`,
            destination: null,
            externalUrl: deepLink,
            postId: null,
            status: "pending",
            remindMe: true,
            reminderSentAt: null,
            snoozedUntil: null,
            dueAt: new Date("2026-07-20T14:00:00.000Z")
          }
        ])
      }
    };

    const packets = await listDueScheduleReminders(prisma as never, CREATOR, {
      now,
      limit: 10,
      relayWebBase: "https://relay.example"
    });
    expect(packets).toHaveLength(1);
    const packet = packets[0]!;
    expect(packet.reminder_id).toBe(reminderIdForManualEvent(EVENT));
    expect(packet.event_type).toBe("custom");
    expect(packet.manual_event_id).toBe(EVENT);
    expect(packet.primary_cta.kind).toBe("external_post");
    expect(packet.primary_cta.url).toBe(deepLink);
    // Opening CTA does not mutate event status — listDue is read-only.
    expect(prisma.creatorScheduleEvent.findMany).toHaveBeenCalled();
  });
});
