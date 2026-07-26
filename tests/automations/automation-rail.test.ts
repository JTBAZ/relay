/**
 * AUT-VS5-T01 — planned + prepared automation rail metadata (no new source).
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadAutomationRailMetaForEventIds,
  loadAutomationRailMetaForSeriesIds
} from "../../src/autopost/automation-attention-service.js";
import { AUTOMATIONS_QA_PERSONA } from "./fixtures.js";

const CREATOR = AUTOMATIONS_QA_PERSONA.creator_id;
const OTHER = "creator_other_isolation";
const SERIES = "series_auto_1";
const AUTO = "auto_rail_1";
const EVENT = "evt_rail_1";
const RUN = "run_rail_1";
const RULE = "rule_rail_1";
const DRAFT = "draft_rail_1";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

describe("loadAutomationRailMetaForSeriesIds", () => {
  it("maps series → planned automation meta and ignores other creators", async () => {
    const prisma = {
      creatorAutomation: {
        findMany: vi.fn(async ({ where }: { where: { creatorId: string } }) => {
          expect(where.creatorId).toBe(CREATOR);
          return [
            {
              id: AUTO,
              title: "Sunday preview",
              presetKind: "preview_crosspost",
              scheduleSeriesId: SERIES
            }
          ];
        })
      }
    };
    const map = await loadAutomationRailMetaForSeriesIds(prisma as never, CREATOR, [
      SERIES,
      "series_unknown"
    ]);
    expect(map.get(SERIES)).toEqual({
      automation_id: AUTO,
      automation_title: "Sunday preview",
      preset_kind: "preview_crosspost",
      automation_state: "planned"
    });
    expect(map.has("series_unknown")).toBe(false);
  });
});

describe("loadAutomationRailMetaForEventIds", () => {
  it("maps attention events → awaiting_review meta with draft/run/expiry", async () => {
    const expires = new Date("2026-07-22T14:00:00.000Z");
    const prisma = {
      creatorDistributionRuleRun: {
        findMany: vi.fn(async ({ where }: { where: { creatorId: string } }) => {
          expect(where.creatorId).toBe(CREATOR);
          return [
            {
              id: RUN,
              draftId: DRAFT,
              expiresAt: expires,
              sourcePostId: "post_1",
              materializedEventId: EVENT,
              ruleId: RULE
            }
          ];
        })
      },
      creatorAutomation: {
        findMany: vi.fn(async () => [
          {
            id: AUTO,
            title: "Sunday preview",
            presetKind: "preview_crosspost",
            distributionRuleId: RULE
          }
        ])
      }
    };
    const map = await loadAutomationRailMetaForEventIds(prisma as never, CREATOR, [
      EVENT,
      "evt_ordinary"
    ]);
    expect(map.get(EVENT)).toEqual({
      automation_id: AUTO,
      automation_title: "Sunday preview",
      preset_kind: "preview_crosspost",
      automation_state: "awaiting_review",
      automation_run_id: RUN,
      draft_id: DRAFT,
      expires_at: expires.toISOString(),
      source_post_id: "post_1"
    });
    expect(map.has("evt_ordinary")).toBe(false);
  });

  it("does not leak runs across creators", async () => {
    const prisma = {
      creatorDistributionRuleRun: {
        findMany: vi.fn(async ({ where }: { where: { creatorId: string } }) => {
          expect(where.creatorId).toBe(OTHER);
          return [];
        })
      },
      creatorAutomation: { findMany: vi.fn() }
    };
    const map = await loadAutomationRailMetaForEventIds(prisma as never, OTHER, [EVENT]);
    expect(map.size).toBe(0);
  });
});

describe("rail projection contract (source files)", () => {
  it("enriches recurrence_occurrence + manual_event without automation_occurrence", () => {
    const railSrc = readFileSync(
      join(repoRoot, "src/distribution/schedule-rail-service.ts"),
      "utf8"
    );
    expect(railSrc).toMatch(/loadAutomationRailMetaForSeriesIds/);
    expect(railSrc).toMatch(/loadAutomationRailMetaForEventIds/);
    expect(railSrc).toMatch(/automation_id/);
    expect(railSrc).not.toMatch(/automation_occurrence/);
    expect(railSrc).toMatch(/"recurrence_occurrence"/);
    expect(railSrc).toMatch(/"manual_event"/);

    const webSrc = readFileSync(join(repoRoot, "web/lib/schedule-rail-data.ts"), "utf8");
    expect(webSrc).toMatch(/automation_id\?:/);
    expect(webSrc).toMatch(/automation_state\?:/);
  });
});
