/**
 * Automations wire contract characterization (VS0 / B02).
 * @see docs/studio/automation-build-plans/01-VS0-BASELINE-CONTRACTS.md
 */
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_CONTRACT_VERSION,
  AUTOMATION_DEFAULT_APPROVAL_TTL_HOURS,
  AUTOMATION_ERROR_CODES,
  AUTOMATION_PRESET_KINDS,
  AUTOMATION_RUN_STATUSES,
  AUTOMATIONS_FEATURE_ENV,
  AutomationContractError,
  automationRunIdempotencyKeyForOccurrence,
  automationRunIdempotencyKeyForRulePost,
  getAutomationFeatureFlags,
  isAutomationsFeatureEnabled,
  validateCreateAutomationBody,
  validatePatchAutomationBody
} from "../../src/autopost/automation-contract.js";
import {
  AUTOMATIONS_AU_TRACE,
  AUTOMATIONS_CREATE_DELAYED_RELEASE,
  AUTOMATIONS_CREATE_PREVIEW_CROSSPOST,
  AUTOMATIONS_QA_PERSONA,
  AUTOMATIONS_SAMPLE_APPROVAL_CONTEXT,
  AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW,
  AUTOMATIONS_SAMPLE_RUN_PENDING,
  automationsFixtureManifest
} from "./fixtures.js";

describe("automations contract — feature flag", () => {
  it("defaults OFF when env unset", () => {
    expect(isAutomationsFeatureEnabled({})).toBe(false);
    expect(getAutomationFeatureFlags({})).toEqual({ enabled: false });
  });

  it("defaults OFF for false/0/off", () => {
    expect(isAutomationsFeatureEnabled({ [AUTOMATIONS_FEATURE_ENV]: "false" })).toBe(false);
    expect(isAutomationsFeatureEnabled({ [AUTOMATIONS_FEATURE_ENV]: "0" })).toBe(false);
    expect(isAutomationsFeatureEnabled({ [AUTOMATIONS_FEATURE_ENV]: "off" })).toBe(false);
  });

  it("enables only for 1/true/yes/on", () => {
    expect(isAutomationsFeatureEnabled({ [AUTOMATIONS_FEATURE_ENV]: "1" })).toBe(true);
    expect(isAutomationsFeatureEnabled({ [AUTOMATIONS_FEATURE_ENV]: "true" })).toBe(true);
    expect(isAutomationsFeatureEnabled({ [AUTOMATIONS_FEATURE_ENV]: "yes" })).toBe(true);
    expect(isAutomationsFeatureEnabled({ [AUTOMATIONS_FEATURE_ENV]: "on" })).toBe(true);
  });
});

describe("automations contract — vocabulary", () => {
  it("freezes V1 presets only", () => {
    expect([...AUTOMATION_PRESET_KINDS]).toEqual([
      "preview_crosspost",
      "delayed_public_release"
    ]);
  });

  it("includes TTL default 72h and planned run statuses expired|cancelled", () => {
    expect(AUTOMATION_DEFAULT_APPROVAL_TTL_HOURS).toBe(72);
    expect(AUTOMATION_RUN_STATUSES).toContain("expired");
    expect(AUTOMATION_RUN_STATUSES).toContain("cancelled");
    expect(AUTOMATION_RUN_STATUSES).toContain("skipped");
  });

  it("exposes stable error codes used by acceptance gates", () => {
    for (const code of [
      "AUTOMATION_DISABLED",
      "AUTOMATION_PLAN_REQUIRED",
      "AUTOMATION_TEMPLATE_NOT_FOUND",
      "AUTOMATION_DESTINATION_UNLINKED",
      "AUTOMATION_NO_ELIGIBLE_POST",
      "AUTOMATION_APPROVAL_EXPIRED",
      "AUTOMATION_VERSION_CONFLICT"
    ] as const) {
      expect(AUTOMATION_ERROR_CODES).toContain(code);
    }
  });

  it("names contract version for fixture manifests", () => {
    expect(AUTOMATION_CONTRACT_VERSION).toBe("automations-wire-v1");
  });
});

describe("automations contract — validateCreateAutomationBody", () => {
  it("normalizes preview_crosspost (AU-02)", () => {
    const body = validateCreateAutomationBody(AUTOMATIONS_CREATE_PREVIEW_CROSSPOST);
    expect(body.preset_kind).toBe("preview_crosspost");
    expect(body.source_kind).toBe("latest_patreon_post");
    expect(body.trigger_kind).toBe("scheduled_occurrence");
    expect(body.series_materialization_kind).toBe("automation_trigger");
    expect(body.offset_days).toBeNull();
    expect(body.schedule?.weekdays).toEqual([4]);
    expect(body.schedule?.timezone).toBe(AUTOMATIONS_QA_PERSONA.timezone);
    expect(body.preview_template_id).toBe(AUTOMATIONS_QA_PERSONA.preview_template_id);
    expect(body.approval_ttl_hours).toBe(72);
  });

  it("rejects preview_crosspost without template", () => {
    expect(() =>
      validateCreateAutomationBody({
        ...AUTOMATIONS_CREATE_PREVIEW_CROSSPOST,
        preview_template_id: null
      })
    ).toThrow(AutomationContractError);
    try {
      validateCreateAutomationBody({
        ...AUTOMATIONS_CREATE_PREVIEW_CROSSPOST,
        preview_template_id: null
      });
    } catch (e) {
      expect((e as AutomationContractError).code).toBe("AUTOMATION_TEMPLATE_NOT_FOUND");
    }
  });

  it("rejects preview_crosspost without schedule weekdays", () => {
    expect(() =>
      validateCreateAutomationBody({
        ...AUTOMATIONS_CREATE_PREVIEW_CROSSPOST,
        schedule: {
          cadence: "weekly",
          local_time: "10:00",
          timezone: "UTC",
          weekdays: []
        }
      })
    ).toThrow(/weekdays/);
  });

  it("rejects offset_days on preview_crosspost", () => {
    expect(() =>
      validateCreateAutomationBody({
        ...AUTOMATIONS_CREATE_PREVIEW_CROSSPOST,
        offset_days: 7
      })
    ).toThrow(AutomationContractError);
  });

  it("normalizes delayed_public_release (AU-11)", () => {
    const body = validateCreateAutomationBody(AUTOMATIONS_CREATE_DELAYED_RELEASE);
    expect(body.preset_kind).toBe("delayed_public_release");
    expect(body.source_kind).toBe("triggering_patreon_post");
    expect(body.trigger_kind).toBe("patreon_published");
    expect(body.series_materialization_kind).toBeNull();
    expect(body.schedule).toBeNull();
    expect(body.offset_days).toBe(30);
  });

  it("defaults offset_days to 30 when omitted for delayed release", () => {
    const body = validateCreateAutomationBody({
      preset_kind: "delayed_public_release",
      target_destinations: ["x"]
    });
    expect(body.offset_days).toBe(30);
  });

  it("rejects schedule on delayed_public_release", () => {
    expect(() =>
      validateCreateAutomationBody({
        ...AUTOMATIONS_CREATE_DELAYED_RELEASE,
        schedule: AUTOMATIONS_CREATE_PREVIEW_CROSSPOST.schedule
      })
    ).toThrow(/schedule is not allowed/);
  });

  it("rejects empty destinations", () => {
    expect(() =>
      validateCreateAutomationBody({
        preset_kind: "delayed_public_release",
        target_destinations: []
      })
    ).toThrow(AutomationContractError);
  });

  it("rejects unknown destination", () => {
    try {
      validateCreateAutomationBody({
        preset_kind: "delayed_public_release",
        target_destinations: ["tiktok"]
      });
      expect.unreachable();
    } catch (e) {
      expect((e as AutomationContractError).code).toBe("AUTOMATION_DESTINATION_UNLINKED");
    }
  });
});

describe("automations contract — validatePatchAutomationBody", () => {
  it("requires version for conflict safety (AU-10)", () => {
    try {
      validatePatchAutomationBody({ status: "paused" });
      expect.unreachable();
    } catch (e) {
      expect((e as AutomationContractError).code).toBe("AUTOMATION_VERSION_CONFLICT");
    }
  });

  it("accepts pause/archive with version", () => {
    expect(validatePatchAutomationBody({ version: 1, status: "paused" })).toEqual({
      version: 1,
      status: "paused"
    });
    expect(validatePatchAutomationBody({ version: 2, status: "archived" }).status).toBe(
      "archived"
    );
  });
});

describe("automations contract — idempotency helpers", () => {
  it("formats occurrence and rule+post keys", () => {
    expect(automationRunIdempotencyKeyForOccurrence("occ_1")).toBe("occurrence:occ_1");
    expect(automationRunIdempotencyKeyForRulePost("rule_1", "post_1")).toBe(
      "rule:rule_1:post:post_1"
    );
  });
});

describe("automations fixtures — AU trace + sample wires", () => {
  it("maps AU-01..AU-12 with primary owners", () => {
    const manifest = automationsFixtureManifest();
    expect(manifest.acceptance_ids).toHaveLength(12);
    expect(manifest.persona_creator_id).toBe(AUTOMATIONS_QA_PERSONA.creator_id);
    expect(AUTOMATIONS_AU_TRACE["AU-02"].primary_owner).toBe("VS2");
    expect(AUTOMATIONS_AU_TRACE["AU-11"].primary_owner).toBe("VS3");
    expect(AUTOMATIONS_QA_PERSONA.legacy.schedule_series_id).toMatch(/^series_legacy/);
  });

  it("sample connector matches create vocabulary (AU-02)", () => {
    expect(AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.preset_kind).toBe("preview_crosspost");
    expect(AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.series_materialization_kind).toBe(
      "automation_trigger"
    );
    expect(AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.distribution_rule_id).toBeTruthy();
    expect(AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.schedule_series_id).toBeTruthy();
  });

  it("sample run + approval omit plan until export (AU-06/AU-09)", () => {
    expect(AUTOMATIONS_SAMPLE_RUN_PENDING.plan_id).toBeNull();
    expect(AUTOMATIONS_SAMPLE_APPROVAL_CONTEXT.existing_plan_id).toBeNull();
    expect(AUTOMATIONS_SAMPLE_APPROVAL_CONTEXT.source_image_export_path).not.toMatch(
      /signed|token=/i
    );
  });
});
