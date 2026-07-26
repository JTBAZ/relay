/**
 * AUT-VS4-T01 — trigger-only schedule series mode (automation_trigger).
 * Planned calendar ticks without blank-post / draft / plan / task JIT.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createScheduleSeries,
  ensureOccurrencesForSeries,
  enumerateOccurrenceKeysWithTime,
  materializeOccurrence,
  patchScheduleSeries,
  reconcileAllActiveSeries,
  reconcileSeriesMaterialization,
  ScheduleSeriesValidationError,
  twoMonthHorizonEnd
} from "../../src/autopost/schedule-series-service.js";
import { AUTOMATIONS_QA_PERSONA } from "./fixtures.js";

vi.mock("../../src/billing/creator-plan-entitlement-service.js", () => ({
  requireCreatorPlanAtLeast: vi.fn().mockResolvedValue({ ok: true })
}));

vi.mock("../../src/distribution/schedule-rail-service.js", () => ({
  createScheduledPostForRail: vi.fn(),
  ScheduleRailValidationError: class ScheduleRailValidationError extends Error {}
}));

import { createScheduledPostForRail } from "../../src/distribution/schedule-rail-service.js";

const mockedCreatePost = vi.mocked(createScheduledPostForRail);
const CREATOR = AUTOMATIONS_QA_PERSONA.creator_id;

type OccRow = {
  id: string;
  seriesId: string;
  creatorId: string;
  occurrenceKey: string;
  dueAt: Date;
  status: string;
  postId: string | null;
  draftId: string | null;
  primaryTaskId: string | null;
  failureReason: string | null;
  materializedAt: Date | null;
  completedAt: Date | null;
};

type SeriesRow = {
  id: string;
  creatorId: string;
  status: string;
  cadence: string;
  interval: number;
  localTime: string;
  timezone: string;
  weekdays: number[];
  monthDays: number[];
  plannedFormat: string;
  destinations: string[];
  remindMe: boolean;
  titleHint: string | null;
  startsAt: Date;
  endsAt: Date | null;
  sourcePostId: string | null;
  materializationKind: string;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function createSeriesMemory() {
  let seq = 0;
  const nextId = (p: string) => `${p}_${++seq}`;
  const series = new Map<string, SeriesRow>();
  const occs = new Map<string, OccRow>();

  const prisma = {
    creatorScheduleSeries: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: SeriesRow = {
          id: nextId("series"),
          creatorId: data.creatorId as string,
          status: (data.status as string) ?? "active",
          cadence: data.cadence as string,
          interval: data.interval as number,
          localTime: data.localTime as string,
          timezone: data.timezone as string,
          weekdays: (data.weekdays as number[]) ?? [],
          monthDays: (data.monthDays as number[]) ?? [],
          plannedFormat: (data.plannedFormat as string) ?? "mixed",
          destinations: (data.destinations as string[]) ?? [],
          remindMe: (data.remindMe as boolean) ?? true,
          titleHint: (data.titleHint as string | null) ?? null,
          startsAt: data.startsAt as Date,
          endsAt: (data.endsAt as Date | null) ?? null,
          sourcePostId: (data.sourcePostId as string | null) ?? null,
          materializationKind: (data.materializationKind as string) ?? "post_draft",
          lastError: null,
          createdAt: new Date("2026-07-01T00:00:00.000Z"),
          updatedAt: new Date("2026-07-01T00:00:00.000Z")
        };
        series.set(row.id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => series.get(where.id) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { id: string; creatorId: string } }) => {
        const row = series.get(where.id);
        if (!row || row.creatorId !== where.creatorId) return null;
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where?: { status?: string; creatorId?: string } }) => {
        return [...series.values()].filter((row) => {
          if (where?.status && row.status !== where.status) return false;
          if (where?.creatorId && row.creatorId !== where.creatorId) return false;
          return true;
        });
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = series.get(where.id)!;
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      })
    },
    creatorScheduleOccurrence: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const key = `${data.seriesId}:${data.occurrenceKey}`;
        for (const existing of occs.values()) {
          if (existing.seriesId === data.seriesId && existing.occurrenceKey === data.occurrenceKey) {
            const err = new Error("Unique constraint failed") as Error & { code: string };
            err.code = "P2002";
            throw err;
          }
        }
        const row: OccRow = {
          id: nextId("occ"),
          seriesId: data.seriesId as string,
          creatorId: data.creatorId as string,
          occurrenceKey: data.occurrenceKey as string,
          dueAt: data.dueAt as Date,
          status: (data.status as string) ?? "planned",
          postId: null,
          draftId: null,
          primaryTaskId: null,
          failureReason: null,
          materializedAt: null,
          completedAt: null
        };
        occs.set(row.id, row);
        void key;
        return row;
      }),
      findUnique: vi.fn(async ({ where, include }: { where: { id: string }; include?: { series?: boolean } }) => {
        const row = occs.get(where.id);
        if (!row) return null;
        if (include?.series) {
          return { ...row, series: series.get(row.seriesId)! };
        }
        return row;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const list = [...occs.values()].filter((o) => {
          if (where.seriesId && o.seriesId !== where.seriesId) return false;
          if (where.status && typeof where.status === "object") {
            const inn = (where.status as { in?: string[] }).in;
            if (inn && !inn.includes(o.status)) return false;
          } else if (where.status && o.status !== where.status) return false;
          return true;
        });
        list.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
        return list[0] ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return [...occs.values()]
          .filter((o) => {
            if (where.seriesId && o.seriesId !== where.seriesId) return false;
            if (where.status && typeof where.status === "object") {
              const inn = (where.status as { in?: string[] }).in;
              if (inn && !inn.includes(o.status)) return false;
            } else if (where.status && o.status !== where.status) return false;
            return true;
          })
          .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = occs.get(where.id)!;
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        let count = 0;
        for (const [id, o] of [...occs.entries()]) {
          if (where.seriesId && o.seriesId !== where.seriesId) continue;
          if (where.status && o.status !== where.status) continue;
          if (where.dueAt && typeof where.dueAt === "object") {
            const gt = (where.dueAt as { gt?: Date }).gt;
            if (gt && !(o.dueAt.getTime() > gt.getTime())) continue;
          }
          occs.delete(id);
          count += 1;
        }
        return { count };
      })
    },
    postbotTask: {
      findMany: vi.fn(async () => [])
    }
  };

  return { prisma: prisma as any, series, occs };
}

describe("trigger-only series (AUT-VS4-T01)", () => {
  beforeEach(() => {
    mockedCreatePost.mockReset();
    process.env.RELAY_FEATURE_SCHEDULE_SERIES = "true";
  });

  it("serializes materialization_kind and creates planned ticks without posts", async () => {
    const { prisma, occs } = createSeriesMemory();
    const wire = await createScheduleSeries(prisma, CREATOR, {
      cadence: "weekly",
      interval: 1,
      local_time: "10:00",
      timezone: "UTC",
      weekdays: [3],
      destinations: ["x"],
      title_hint: "Preview tick",
      starts_at: "2026-07-01T14:00:00.000Z",
      materialization_kind: "automation_trigger"
    });

    expect(wire.materialization_kind).toBe("automation_trigger");
    expect(occs.size).toBeGreaterThan(4);
    expect([...occs.values()].every((o) => o.status === "planned")).toBe(true);
    expect([...occs.values()].every((o) => o.postId == null && o.draftId == null)).toBe(true);
    expect(mockedCreatePost).not.toHaveBeenCalled();
  });

  it("defaults ordinary create to post_draft and JIT path still materializes", async () => {
    const { prisma, occs } = createSeriesMemory();
    mockedCreatePost.mockResolvedValue({
      id: "evt_1",
      task_id: "task_1",
      post_id: "post_1",
      draft_id: "draft_1",
      destinations: []
    } as any);

    // Start far in the future so create-time reconcile does not JIT; then force within lead.
    const wire = await createScheduleSeries(prisma, CREATOR, {
      cadence: "weekly",
      interval: 1,
      local_time: "10:00",
      timezone: "UTC",
      weekdays: [3],
      destinations: ["x"],
      starts_at: "2026-09-01T14:00:00.000Z"
    });

    expect(wire.materialization_kind).toBe("post_draft");
    expect(mockedCreatePost).not.toHaveBeenCalled();

    const seriesId = wire.series_id;
    const firstPlanned = [...occs.values()].find(
      (o) => o.seriesId === seriesId && o.status === "planned"
    )!;
    const withinLead = new Date(firstPlanned.dueAt.getTime() - 2 * 24 * 60 * 60 * 1000);
    const r = await reconcileSeriesMaterialization(prisma, seriesId, withinLead);
    expect(r.materialized).toBe(1);
    expect(mockedCreatePost).toHaveBeenCalledTimes(1);
  });

  it("rejects materializeOccurrence for automation_trigger", async () => {
    const { prisma, occs } = createSeriesMemory();
    const wire = await createScheduleSeries(prisma, CREATOR, {
      cadence: "weekly",
      local_time: "10:00",
      timezone: "UTC",
      weekdays: [1],
      destinations: ["bluesky"],
      starts_at: "2026-07-01T14:00:00.000Z",
      materialization_kind: "automation_trigger"
    });
    const occId = [...occs.values()].find((o) => o.seriesId === wire.series_id)!.id;
    await expect(materializeOccurrence(prisma, occId)).rejects.toBeInstanceOf(
      ScheduleSeriesValidationError
    );
    expect(mockedCreatePost).not.toHaveBeenCalled();
  });

  it("reconcileAllActiveSeries ensures ticks for trigger series but never materializes posts", async () => {
    const { prisma, occs } = createSeriesMemory();
    await createScheduleSeries(prisma, CREATOR, {
      cadence: "monthly",
      local_time: "15:00",
      timezone: "UTC",
      month_days: [31],
      destinations: ["x"],
      starts_at: "2026-01-31T15:00:00.000Z",
      materialization_kind: "automation_trigger"
    });
    const before = occs.size;
    const result = await reconcileAllActiveSeries(prisma, {
      now: new Date("2026-02-01T00:00:00.000Z"),
      creatorId: CREATOR
    });
    expect(result.series).toBe(1);
    expect(result.materialized).toBe(0);
    expect(occs.size).toBeGreaterThanOrEqual(before);
    expect(mockedCreatePost).not.toHaveBeenCalled();
    const feb = [...occs.values()].find((o) => o.occurrenceKey.startsWith("2026-02-"));
    expect(feb?.occurrenceKey).toBe("2026-02-28");
  });

  it("pause stops new occurrence ensure; resume restores ticks", async () => {
    const { prisma, series, occs } = createSeriesMemory();
    const wire = await createScheduleSeries(prisma, CREATOR, {
      cadence: "weekly",
      local_time: "09:00",
      timezone: "UTC",
      weekdays: [2],
      destinations: ["x"],
      starts_at: "2026-07-01T12:00:00.000Z",
      materialization_kind: "automation_trigger"
    });
    const countActive = occs.size;
    await patchScheduleSeries(prisma, CREATOR, wire.series_id, { status: "paused" });
    expect(series.get(wire.series_id)!.status).toBe("paused");
    const ensuredWhilePaused = await ensureOccurrencesForSeries(
      prisma,
      wire.series_id,
      new Date("2026-07-15T00:00:00.000Z")
    );
    expect(ensuredWhilePaused).toBe(0);

    await patchScheduleSeries(prisma, CREATOR, wire.series_id, { status: "active" });
    expect(series.get(wire.series_id)!.status).toBe("active");
    expect(occs.size).toBeGreaterThanOrEqual(countActive);
    expect(mockedCreatePost).not.toHaveBeenCalled();
  });

  it("ends_at caps horizon; ensure is idempotent on retry", async () => {
    const { prisma, occs } = createSeriesMemory();
    const wire = await createScheduleSeries(prisma, CREATOR, {
      cadence: "weekly",
      local_time: "11:00",
      timezone: "UTC",
      weekdays: [5],
      destinations: ["x"],
      starts_at: "2026-07-01T12:00:00.000Z",
      ends_at: "2026-07-20T00:00:00.000Z",
      materialization_kind: "automation_trigger"
    });
    const first = occs.size;
    expect(first).toBeGreaterThan(0);
    expect([...occs.values()].every((o) => o.dueAt.getTime() < Date.parse("2026-07-20T00:00:00.000Z"))).toBe(
      true
    );
    const again = await ensureOccurrencesForSeries(prisma, wire.series_id, new Date("2026-07-05T00:00:00.000Z"));
    expect(again).toBe(0);
    expect(occs.size).toBe(first);
  });

  it("DST spring-forward still yields stable weekly keys in America/New_York", () => {
    const startsAt = new Date("2026-03-01T15:00:00.000Z");
    const horizon = twoMonthHorizonEnd(startsAt, "America/New_York");
    const rows = enumerateOccurrenceKeysWithTime({
      cadence: "weekly",
      interval: 1,
      weekdays: [0], // Sunday
      monthDays: [],
      timezone: "America/New_York",
      startsAt,
      endsAt: null,
      horizonEnd: horizon,
      hour: 10,
      minute: 0
    });
    const spring = rows.find((r) => r.key === "2026-03-08");
    expect(spring).toBeTruthy();
    expect(spring!.dueAt.toISOString()).toMatch(/2026-03-08T/);
  });

  it("rejects seed on automation_trigger create", async () => {
    const { prisma } = createSeriesMemory();
    await expect(
      createScheduleSeries(prisma, CREATOR, {
        cadence: "weekly",
        local_time: "10:00",
        destinations: ["x"],
        weekdays: [1],
        materialization_kind: "automation_trigger",
        seed: { due_at: "2026-07-06T14:00:00.000Z", post_id: "p1" }
      })
    ).rejects.toBeInstanceOf(ScheduleSeriesValidationError);
  });
});
