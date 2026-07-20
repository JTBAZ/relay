/**
 * AUT-VS0-T01 / B01 — read-only characterization of Autopost schedule atoms.
 * Documents reusable seams, idempotency keys, and contract conflicts for Automations.
 * Does not change production behavior.
 *
 * @see docs/studio/automation-build-plans/01-VS0-BASELINE-CONTRACTS.md
 * @see docs/studio/automation-build-plans/PRODUCT-CONTRACT.md
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MATERIALIZE_LEAD_DAYS,
  enumerateOccurrenceKeysWithTime,
  listPlannedOccurrencesForRail,
  materializeOccurrence,
  reconcileAllActiveSeries
} from "../../src/autopost/schedule-series-service.js";
import {
  createDistributionRule,
  discoverDistributionRuleRuns,
  materializeDueDistributionRuns,
  reconcileDistributionRules
} from "../../src/autopost/distribution-rule-service.js";
import {
  applySocialPlaybook,
  listSocialPlaybookTemplates,
  loadPlaybookRailMetaByMaterializedIds
} from "../../src/autopost/social-playbook-service.js";
import {
  SOCIAL_PLAYBOOK_EXECUTION_MODES,
  SOCIAL_PLAYBOOK_TEMPLATE_KEYS
} from "../../src/autopost/social-playbook-contract.js";
import {
  MANUAL_EVENT_REMINDER_ID_PREFIX,
  reminderIdForManualEvent,
  parseManualEventReminderId,
  CREATOR_SCHEDULE_EVENT_TYPES
} from "../../src/distribution/creator-schedule-event-contract.js";
import { canonicalizeLooseExternalUrl } from "../../src/distribution/creator-schedule-event-service.js";
import {
  getCreatorScheduleRail,
  groupScheduleRailItems,
  type ScheduleRailEventSource
} from "../../src/distribution/schedule-rail-service.js";
import {
  REMINDER_ID_PREFIX,
  listDueScheduleReminders
} from "../../src/distribution/schedule-reminder-extension-api.js";
import {
  MAX_CUSTOM_PREVIEW_TEMPLATES,
  PREVIEW_TEMPLATE_SCHEMA_VERSION,
  parsePreviewTemplateConfig
} from "../../src/distribution/preview-template-config.js";
import {
  createPreviewTemplate,
  listPreviewTemplates
} from "../../src/distribution/preview-template-service.js";
import {
  createPostDistributionPlan,
  startDistributionHandoff,
  completeDistributionAttempt,
  PostDistributionValidationError
} from "../../src/distribution/post-distribution-service.js";
import { buildPreviewizerSession } from "../../web/lib/previewizer-session.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

function readSrc(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("Automations spine characterization (AUT-VS0-T01)", () => {
  it("exposes schedule-series occurrence generation and JIT materialization seams", () => {
    expect(MATERIALIZE_LEAD_DAYS).toBe(7);
    expect(typeof enumerateOccurrenceKeysWithTime).toBe("function");
    expect(typeof listPlannedOccurrencesForRail).toBe("function");
    expect(typeof materializeOccurrence).toBe("function");
    expect(typeof reconcileAllActiveSeries).toBe("function");

    const seriesSrc = readSrc("src/autopost/schedule-series-service.ts");
    expect(seriesSrc).toMatch(/@@unique|occurrenceKey|occurrence_key/);
    expect(seriesSrc).toMatch(/createScheduledPostForRail/);
    expect(seriesSrc).toMatch(/status:\s*"planned"/);
    // VS4: automation_trigger skips blank-post JIT; ordinary post_draft still uses createScheduledPostForRail.
    expect(seriesSrc).toMatch(/automation_trigger/);
    expect(seriesSrc).toMatch(/materializationKind|materialization_kind/);
    expect(seriesSrc).toMatch(/isAutomationTriggerSeries/);
  });

  it("exposes distribution-rule discovery and draft-only materialization seams", () => {
    expect(typeof createDistributionRule).toBe("function");
    expect(typeof discoverDistributionRuleRuns).toBe("function");
    expect(typeof materializeDueDistributionRuns).toBe("function");
    expect(typeof reconcileDistributionRules).toBe("function");

    const ruleSrc = readSrc("src/autopost/distribution-rule-service.ts");
    const matSrc = readSrc("src/autopost/automation-materializer.ts");
    expect(ruleSrc).toMatch(/triggerKind:\s*"patreon_published"|patreon_published/);
    expect(ruleSrc).toMatch(/materializeAutomationOwnedDistributionRun|materializeLegacyDistributionRun/);
    expect(matSrc).toMatch(/saveAutopostDraft/);
    expect(matSrc).toMatch(/automation_rule_id/);
    expect(matSrc).toMatch(/materializeAutomationOwnedDistributionRun/);
    expect(ruleSrc).toMatch(/draftOnly:\s*true|draft_only/);
    // Materialization creates AutopostDraft only — no PostDistributionPlan / PostbotTask.
    expect(matSrc).not.toMatch(/createPostDistributionPlan|createScheduledPostForRail/);
    expect(ruleSrc).not.toMatch(/createPostDistributionPlan|createScheduledPostForRail/);
  });

  it("exposes social-playbook atom materialization + rail enrichment pattern", () => {
    expect(typeof applySocialPlaybook).toBe("function");
    expect(typeof listSocialPlaybookTemplates).toBe("function");
    expect(typeof loadPlaybookRailMetaByMaterializedIds).toBe("function");
    expect(SOCIAL_PLAYBOOK_EXECUTION_MODES).toEqual(
      expect.arrayContaining(["reminder", "draft"])
    );
    expect(SOCIAL_PLAYBOOK_TEMPLATE_KEYS.length).toBeGreaterThan(0);

    const playbookSrc = readSrc("src/autopost/social-playbook-service.ts");
    expect(playbookSrc).toMatch(/createScheduledPostForRail/);
    expect(playbookSrc).toMatch(/creatorScheduleEvent\.create/);
    expect(playbookSrc).toMatch(/materializedEventId|materialized_event_id/);
    expect(playbookSrc).toMatch(/materializedTaskId|materialized_task_id/);
    expect(playbookSrc).toMatch(/creatorId_templateKey_anchorPostId/);
  });

  it("exposes manual-event rail and schedule_reminder:manual: packet semantics", () => {
    expect(MANUAL_EVENT_REMINDER_ID_PREFIX).toBe("schedule_reminder:manual:");
    expect(REMINDER_ID_PREFIX).toBe("schedule_reminder:task:");
    expect(reminderIdForManualEvent("evt_1")).toBe("schedule_reminder:manual:evt_1");
    expect(parseManualEventReminderId("schedule_reminder:manual:evt_1")).toBe("evt_1");
    expect(CREATOR_SCHEDULE_EVENT_TYPES).toEqual(
      expect.arrayContaining(["custom", "make_post", "repost", "pin_comment"])
    );

    const loose = canonicalizeLooseExternalUrl("http://studio.example/approve?run=abc");
    expect(loose.ok).toBe(true);
    if (loose.ok) {
      expect(loose.url.startsWith("https://")).toBe(true);
    }

    expect(typeof listDueScheduleReminders).toBe("function");
    const reminderSrc = readSrc("src/distribution/schedule-reminder-extension-api.ts");
    expect(reminderSrc).toMatch(/creatorScheduleEvent\.findMany/);
    expect(reminderSrc).toMatch(/reminderIdForManualEvent/);
    expect(reminderSrc).toMatch(/manual_event_id/);
    // No automation-specific reminder family today — product contract reuses manual.
    expect(reminderSrc).not.toMatch(/schedule_reminder:automation:/);
  });

  it("exposes Schedule Rail sources and playbook-style enrichment without automation source", () => {
    expect(typeof getCreatorScheduleRail).toBe("function");
    expect(typeof groupScheduleRailItems).toBe("function");
    expect(typeof listPlannedOccurrencesForRail).toBe("function");

    const sources: ScheduleRailEventSource[] = [
      "postbot_task",
      "manual_event",
      "recurrence_occurrence"
    ];
    expect(sources).toHaveLength(3);

    const railSrc = readSrc("src/distribution/schedule-rail-service.ts");
    expect(railSrc).toMatch(/recurrence_occurrence/);
    expect(railSrc).toMatch(/playbook_run_id/);
    expect(railSrc).toMatch(/loadPlaybookRailMetaByMaterializedIds/);
    expect(railSrc).not.toMatch(/automation_occurrence/);
  });

  it("exposes Previewizer template persistence with crop/selection exclusion", () => {
    expect(PREVIEW_TEMPLATE_SCHEMA_VERSION).toBe(1);
    expect(MAX_CUSTOM_PREVIEW_TEMPLATES).toBe(3);
    expect(typeof listPreviewTemplates).toBe("function");
    expect(typeof createPreviewTemplate).toBe("function");
    expect(typeof parsePreviewTemplateConfig).toBe("function");

    const cfgSrc = readSrc("src/distribution/preview-template-config.ts");
    expect(cfgSrc).toMatch(/No crop\/selection|strips selection|never stored/);
    expect(cfgSrc).toMatch(/if \("selection" in raw\)/);

    const schema = readSrc("prisma/schema.prisma");
    expect(schema).toMatch(/model CreatorPreviewTemplate/);
    expect(schema).toMatch(/creator_preview_templates/);
    // PostTemplate is a different atom (copy/tag filler) — not Previewizer layout.
    expect(schema).toMatch(/model PostTemplate/);

    const session = buildPreviewizerSession({
      creatorId: "c1",
      postId: "p1",
      sourceMediaId: "m1",
      sourceImageUrl: "https://example.test/m1.jpg"
    });
    expect(session).toEqual({
      creatorId: "c1",
      postId: "p1",
      sourceMediaId: "m1",
      sourceImageUrl: "https://example.test/m1.jpg"
    });
    // No initial template config on session today — VS6 must extend additively.
    expect(session).not.toHaveProperty("initialTemplateConfig");
    expect(session).not.toHaveProperty("initialConfig");
  });

  it("rejects preview routing without preview_media_id (ordering invariant)", () => {
    const distSrc = readSrc("src/distribution/post-distribution-service.ts");
    expect(distSrc).toMatch(
      /preview_media_id is required when any destination uses preview routing/
    );
    expect(typeof createPostDistributionPlan).toBe("function");
    expect(PostDistributionValidationError.name).toBe("PostDistributionValidationError");
  });

  it("records human-confirmed distribution handoff boundary (no autonomous publish)", () => {
    expect(typeof startDistributionHandoff).toBe("function");
    expect(typeof completeDistributionAttempt).toBe("function");
    const distSrc = readSrc("src/distribution/post-distribution-service.ts");
    expect(distSrc).toMatch(/export async function startDistributionHandoff/);
    expect(distSrc).toMatch(/export async function completeDistributionAttempt/);
    expect(distSrc).not.toMatch(/auto.?publish|clickPublish|autonomous.?publish/i);
  });

  it("records Prisma idempotency constraints for molecule authorities", () => {
    const schema = readSrc("prisma/schema.prisma");
    expect(schema).toMatch(/@@unique\(\[seriesId, occurrenceKey\]\)/);
    expect(schema).toMatch(/@@unique\(\[ruleId, sourcePostId\]\)/);
    expect(schema).toMatch(/@@unique\(\[creatorId, templateKey, anchorPostId\]\)/);
    expect(schema).toMatch(/enum CreatorScheduleOccurrenceStatus/);
    expect(schema).toMatch(/planned/);
    expect(schema).toMatch(/skipped/);
    expect(schema).toMatch(/enum CreatorDistributionRuleRunStatus/);
    expect(schema).toMatch(/materialized/);
    // VS1 landed: connector + TTL terminals on the existing rule-run ledger (no AutomationRun).
    expect(schema).toMatch(/model CreatorAutomation\b/);
    expect(schema).not.toMatch(/model CreatorAutomationRun\b/);
    expect(schema).toMatch(/expired/);
    expect(schema).toMatch(/cancelled/);
    expect(schema).toMatch(/materializationKind|materialization_kind/);
  });

  it("names Automations conflict inventory for Delta Out (do not fix here)", () => {
    const conflicts = {
      series_materialization:
        "Resolved in VS4/B09: materialization_kind=automation_trigger skips createScheduledPostForRail; Automations coordinator (B10+) claims due trigger ticks.",
      rule_run_statuses:
        "Resolved in VS1 schema: CreatorDistributionRuleRunStatus includes expired|cancelled; service TTL wiring remains VS4.",
      rule_materialization_surface:
        "VS3/VS5: materializeDueDistributionRuns creates AutopostDraft only — no rail event or PostbotTask; automation-owned runs need attention atom projection.",
      rail_source:
        "Confirmed: no automation_occurrence needed; reuse recurrence_occurrence + enriched manual_event (playbook meta pattern).",
      reminder_family:
        "Confirmed: schedule_reminder:manual: supports custom HTTPS deep links via canonicalizeLooseExternalUrl; no new packet family required.",
      previewizer_session:
        "VS6: PreviewizerSession has no initial template config; preload must be additive without changing ordinary callers.",
      preview_before_plan:
        "Confirmed: createPostDistributionPlan rejects preview routing without preview_media_id — gate materializer must not create plan before export.",
      template_authority:
        "Confirmed: CreatorPreviewTemplate (not PostTemplate) owns saved Previewizer layout; crop/selection never persisted.",
      streak_keeper:
        "Deferred post-v1: no-new-post is flat skip+notify today; Streak Keeper may later offer substitute actions (product contract deferred note)."
    };

    expect(Object.keys(conflicts).length).toBeGreaterThanOrEqual(8);
    expect(conflicts.rail_source).toMatch(/no automation_occurrence/);
    expect(conflicts.reminder_family).toMatch(/manual/);
    expect(conflicts.preview_before_plan).toMatch(/preview_media_id/);
    expect(conflicts.series_materialization).toMatch(/VS4/);
  });
});
