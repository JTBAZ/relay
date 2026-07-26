/**
 * VS8-T05 — extension Goal Cycle reminder helpers + Phase 5 compatibility.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyReminderFetchResponse,
  formatGoalCycleToastMeta,
  getGoalCycleReminderContext,
  hasGoalCycleReminderOverlay,
  isAllowedGoalCycleDeepLink,
  isReminderPacketOutdated,
  prepareReminderPacketForDisplay,
  reminderToastMustNeverAutoPublish,
  sanitizeGoalCycleDeepLink
} from "../../extension/src/lib/goal-cycle-reminder";
import type { ScheduleReminderPacket } from "../../extension/src/lib/schedule-reminder-types";

const root = join(process.cwd());

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function phase5Packet(
  patch: Partial<ScheduleReminderPacket> = {}
): ScheduleReminderPacket {
  return {
    reminder_id: "schedule_reminder:task:t1",
    task_id: "t1",
    variant_id: "v1",
    post_id: "p1",
    destination: "patreon",
    action: "post",
    title: "Phase 5 reminder",
    open_url: "https://www.patreon.com/posts/1",
    due_at: "2026-07-20T23:00:00.000Z",
    plan_label: null,
    media_ready: true,
    primary_cta: {
      kind: "external_post",
      url: "https://www.patreon.com/posts/1",
      label: "Open on Patreon"
    },
    secondary_cta: null,
    ...patch
  };
}

function gcPacket(
  patch: Partial<ScheduleReminderPacket> = {}
): ScheduleReminderPacket {
  return phase5Packet({
    goal_cycle_id: "cycle_1",
    goal_cycle_slot_id: "slot_1",
    campaign_key: "gc_camp_cycle_1",
    task_kind: "publish",
    instructions: "Review the draft in Relay, then confirm publish on Patreon.",
    media_requirements: [],
    due_local: "2026-07-20T19:00:00",
    time_zone: "America/New_York",
    ...patch
  });
}

describe("VS8-T05 Goal Cycle reminder helpers", () => {
  it("detects overlay and builds safe context without private media URLs", () => {
    expect(hasGoalCycleReminderOverlay(phase5Packet())).toBe(false);
    const ctx = getGoalCycleReminderContext(gcPacket({ media_ready: false, media_requirements: ["attach_media"] }));
    expect(ctx?.needs_media).toBe(true);
    expect(ctx?.instructions).toMatch(/Review|Attach|confirm/i);
    expect(JSON.stringify(ctx)).not.toMatch(/storage|s3|cdn\/private|password/i);
    expect(formatGoalCycleToastMeta(ctx!)).toMatch(/Publish/);
  });

  it("sanitizes deep links to Relay + destination hosts only", () => {
    expect(isAllowedGoalCycleDeepLink("http://localhost:3000/studio", "patreon")).toBe(true);
    expect(isAllowedGoalCycleDeepLink("https://x.com/home", "x")).toBe(true);
    expect(sanitizeGoalCycleDeepLink("javascript:alert(1)", "patreon")).toBeNull();
    expect(sanitizeGoalCycleDeepLink("https://evil.example/phish", "patreon")).toBeNull();
    const prepared = prepareReminderPacketForDisplay(
      gcPacket({
        open_url: "javascript:alert(1)",
        primary_cta: {
          kind: "external_post",
          url: "https://evil.example/x",
          label: "Bad"
        }
      })
    );
    expect(prepared.open_url).toBeNull();
    expect(prepared.primary_cta.url).toBeNull();
  });

  it("classifies revoked / offline / outdated poll health", () => {
    expect(
      classifyReminderFetchResponse({ ok: false, status: 401 }).status
    ).toBe("revoked");
    expect(
      classifyReminderFetchResponse({ ok: false, status: 0, networkError: true }).status
    ).toBe("offline");
    const stale = phase5Packet({
      due_at: "2026-07-01T00:00:00.000Z"
    });
    const outdated = classifyReminderFetchResponse({
      ok: true,
      status: 200,
      reminders: [stale],
      now: new Date("2026-07-17T12:00:00.000Z")
    });
    expect(outdated.status).toBe("outdated");
    expect(isReminderPacketOutdated(stale, new Date("2026-07-17T12:00:00.000Z"))).toBe(
      true
    );
  });

  it("Phase 5 packets remain displayable without Goal Cycle keys", () => {
    const prepared = prepareReminderPacketForDisplay(phase5Packet());
    expect(prepared.goal_cycle_id).toBeUndefined();
    expect(prepared.primary_cta.url).toBe("https://www.patreon.com/posts/1");
    expect(hasGoalCycleReminderOverlay(prepared)).toBe(false);
  });

  it("never auto-publishes — toast opens URLs only", () => {
    expect(reminderToastMustNeverAutoPublish()).toBe(true);
    const toast = readSrc("extension/src/content/schedule-reminder-toast.ts");
    expect(toast).toMatch(/Never auto-publishes|never auto-publishes|Navigation only/i);
    expect(toast).not.toMatch(/clickPublish|document\.querySelector\(.*publish/i);
    expect(toast).toMatch(/goal-cycle|instructions/i);
    const listener = readSrc("extension/src/lib/schedule-reminder-listener.ts");
    expect(listener).toMatch(/sanitizeGoalCycleDeepLink/);
    expect(listener).toMatch(/revoked|offline/);
    expect(listener).toMatch(/only navigates/i);
    expect(listener).not.toMatch(/clickPublish|querySelector\([^)]*publish/i);
  });

  it("upkeep and active-rest contexts do not require media", () => {
    const upkeep = getGoalCycleReminderContext(
      gcPacket({
        task_kind: "social_upkeep",
        media_ready: true,
        instructions: "Engage without publishing a new Relay post."
      })
    );
    expect(upkeep?.needs_media).toBe(false);
    expect(formatGoalCycleToastMeta(upkeep!)).toMatch(/Social upkeep/);
  });
});
