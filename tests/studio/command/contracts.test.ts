import { describe, expect, it } from "vitest";
import {
  COMMAND_ANALYTICS_COVERAGE,
  COMMAND_CAPABILITY_NAMES,
  COMMAND_ERROR_CODES,
  COMMAND_FORBIDDEN_CAPABILITY_NAMES,
  COMMAND_GRANT_SCOPES,
  CommandContractError,
  RELAY_COMMAND_CONTRACT_VERSION,
  assertCommandCapabilityAllowed,
  getRelayCommandFeatureFlags,
  publicCommandFlags,
  isCommandApplyEnabled,
  validateCommandAnalyticsFactPack,
  validateCommandChangeSetEnvelope,
  validateCommandGrantScopes,
  validateCommandSelectionQuery
} from "../../../src/studio/command/contracts.js";

function validFactPack(overrides: Record<string, unknown> = {}) {
  return {
    pack_id: "cfp_lab2_placeholder",
    generated_at: "2026-08-27T15:00:00.000Z",
    coverage: "weak" as const,
    confidence: "low" as const,
    window_suggestion: {
      weekday: "Tuesday",
      local_start: "19:00",
      local_end: "21:00",
      time_zone: "America/New_York",
      fallback: true
    },
    summary: "Weak evidence; using a disclosed Tuesday evening fallback.",
    evidence_refs: ["ev_window_fallback"],
    ...overrides
  };
}

function validChangeSet(overrides: Record<string, unknown> = {}) {
  return {
    change_set_id: "cs_1",
    idempotency_key: "idem_hero_academy_pages",
    instruction: "Put Hero Academy in a collection ordered by page.",
    resolved_post_ids: ["post_ha_1", "post_ha_2"],
    ops: [
      {
        op_id: "op_1",
        capability: "create_or_update_collection",
        risk_class: "execute_undo",
        target_ids: ["post_ha_1", "post_ha_2"],
        payload: { title: "Hero Academy" }
      }
    ],
    expected_revisions: { post_ha_1: 1 },
    before_snapshot_ref: "snap_before_1",
    after_summary: null,
    access_implications: [],
    status: "preview_ready",
    created_at: "2026-08-27T15:00:00.000Z",
    updated_at: "2026-08-27T15:00:00.000Z",
    ...overrides
  };
}

describe("Relay Command wire contract (RC-P1-T02)", () => {
  it("exports a frozen contract version, capabilities, and stable error codes", () => {
    expect(RELAY_COMMAND_CONTRACT_VERSION).toBe("relay-command-wire-v1");
    expect(COMMAND_CAPABILITY_NAMES).toEqual(
      expect.arrayContaining([
        "search_library",
        "resolve_numbered_sequence",
        "create_or_update_collection",
        "revise_post",
        "create_release_plan",
        "prepare_destination_drafts",
        "apply_change_set",
        "undo_change_set"
      ])
    );
    expect(COMMAND_CAPABILITY_NAMES).not.toContain("publish_external");
    expect(COMMAND_FORBIDDEN_CAPABILITY_NAMES).toContain("publish_external");
    expect(COMMAND_ERROR_CODES).toEqual(
      expect.arrayContaining([
        "COMMAND_VALIDATION",
        "COMMAND_APPLY_DISABLED",
        "COMMAND_WRONG_WRITE_LAYER",
        "COMMAND_STALE_SELECTION",
        "COMMAND_FORBIDDEN"
      ])
    );
    expect(COMMAND_GRANT_SCOPES).not.toContain("publish:execute");
    expect(COMMAND_ANALYTICS_COVERAGE).toEqual(["weak", "ordinary", "clustered", "unavailable"]);
  });

  it("defaults feature flags to disabled", () => {
    expect(getRelayCommandFeatureFlags({})).toEqual({
      layer_enabled: false,
      apply_enabled: false,
      mcp_enabled: false,
      studio_ux_enabled: false,
      selection_ux_enabled: false,
      schedule_plan_enabled: false,
      planner_enabled: false,
      eval_model_enabled: false,
      lab2_seed_allowed: false
    });
    expect(isCommandApplyEnabled({})).toBe(false);
  });

  it("publicCommandFlags omits the seed-allow switch", () => {
    expect(publicCommandFlags({})).toEqual({
      layer_enabled: false,
      apply_enabled: false,
      mcp_enabled: false,
      studio_ux_enabled: false,
      selection_ux_enabled: false,
      schedule_plan_enabled: false
    });
    expect(publicCommandFlags({})).not.toHaveProperty("lab2_seed_allowed");
    expect(publicCommandFlags({})).not.toHaveProperty("planner_enabled");
    expect(publicCommandFlags({})).not.toHaveProperty("eval_model_enabled");
  });

  it("treats 1/true as on and ignores unknown values", () => {
    expect(
      getRelayCommandFeatureFlags({
        RELAY_COMMAND_LAYER_ENABLED: "true",
        RELAY_COMMAND_APPLY_ENABLED: "1",
        RELAY_COMMAND_MCP_ENABLED: "yes",
        RELAY_COMMAND_STUDIO_UX_ENABLED: "on",
        RELAY_COMMAND_SELECTION_UX_ENABLED: "1",
        RELAY_COMMAND_SCHEDULE_PLAN_ENABLED: "1",
        RELAY_COMMAND_PLANNER_ENABLED: "true",
        RELAY_COMMAND_EVAL_MODEL: "1",
        RELAY_ALLOW_STUDIO_LAB2_SEED: "TRUE"
      })
    ).toEqual({
      layer_enabled: true,
      apply_enabled: true,
      mcp_enabled: true,
      studio_ux_enabled: true,
      selection_ux_enabled: true,
      schedule_plan_enabled: true,
      planner_enabled: true,
      eval_model_enabled: true,
      lab2_seed_allowed: true
    });
    expect(getRelayCommandFeatureFlags({ RELAY_COMMAND_APPLY_ENABLED: "bogus" }).apply_enabled).toBe(
      false
    );
  });

  it("allowlist rejects publish_external with COMMAND_FORBIDDEN", () => {
    expect(() => assertCommandCapabilityAllowed("publish_external")).toThrow(
      expect.objectContaining({
        name: "CommandContractError",
        code: "COMMAND_FORBIDDEN"
      })
    );
    expect(assertCommandCapabilityAllowed("search_library")).toBe("search_library");
    expect(() => assertCommandCapabilityAllowed("drop_table")).toThrow(
      expect.objectContaining({ code: "COMMAND_VALIDATION" })
    );
  });

  it("accepts a valid selection query and fact pack", () => {
    const selection = validateCommandSelectionQuery({
      q: "watercolor",
      tag_ids: ["tag_watercolor"],
      date_from: "2026-01-01T00:00:00.000Z",
      date_to: "2026-12-31T23:59:59.000Z",
      destination_absent: ["x"],
      exclude_post_ids: ["post_skip"]
    });
    expect(selection.tag_ids).toEqual(["tag_watercolor"]);
    expect(selection.destination_absent).toEqual(["x"]);

    const pack = validateCommandAnalyticsFactPack(validFactPack());
    expect(pack.coverage).toBe("weak");
    expect(pack.window_suggestion.fallback).toBe(true);
  });

  it("rejects invalid selection fixtures with COMMAND_VALIDATION", () => {
    expect(() => validateCommandSelectionQuery({ date_from: "not-a-timestamp" })).toThrow(
      expect.objectContaining({ code: "COMMAND_VALIDATION" })
    );
    expect(() =>
      validateCommandSelectionQuery({
        date_from: "2026-12-31T00:00:00.000Z",
        date_to: "2026-01-01T00:00:00.000Z"
      })
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));
    expect(() => validateCommandSelectionQuery({ source: "patreon" })).toThrow(
      expect.objectContaining({ code: "COMMAND_VALIDATION" })
    );
    expect(() => validateCommandSelectionQuery({ destination_present: ["tiktok"] })).toThrow(
      expect.objectContaining({ code: "COMMAND_VALIDATION" })
    );
  });

  it("rejects unknown selection keys, empty groups, and AST caps (RC-P5-T03)", () => {
    try {
      validateCommandSelectionQuery({ similar_to: "post_1" });
      expect.unreachable("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CommandContractError);
      expect((err as CommandContractError).details.some((d) => d.issue === "unknown_key")).toBe(true);
    }
    expect(() => validateCommandSelectionQuery({ any: [] })).toThrow(
      expect.objectContaining({ code: "COMMAND_VALIDATION" })
    );
    expect(() =>
      validateCommandSelectionQuery({
        all: [{ any: [{ not: [{ q: "too-deep" }] }] }]
      })
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));
    expect(() =>
      validateCommandSelectionQuery({
        q: "a",
        tag_ids: ["t"],
        title_contains: "b",
        title_pattern: "*",
        description_contains: "d",
        source: "RELAY",
        visibility: "visible",
        collection_id: "c",
        media_type: "image/"
      })
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));
    const nestedOk = validateCommandSelectionQuery({
      all: [{ any: [{ tag_ids: ["tag_watercolor"] }, { tag_ids: ["tag_landscape"] }] }]
    });
    expect(nestedOk.all?.[0]?.any).toHaveLength(2);
  });

  it("rejects raw metric dumps on the fact-pack wire", () => {
    try {
      validateCommandAnalyticsFactPack(validFactPack({ raw_metrics: [{ impressions: 12 }] }));
      expect.unreachable("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CommandContractError);
      expect((err as CommandContractError).code).toBe("COMMAND_VALIDATION");
      expect((err as CommandContractError).details.some((d) => d.field === "raw_metrics")).toBe(
        true
      );
    }
    expect(() =>
      validateCommandAnalyticsFactPack(validFactPack({ coverage: "pretty_sure" }))
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));
    expect(() =>
      validateCommandAnalyticsFactPack(validFactPack({ generated_at: "Tuesday evening" }))
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));
  });

  it("rejects publish:execute grants and unknown scopes", () => {
    expect(validateCommandGrantScopes(["library:read", "command:apply"])).toEqual([
      "library:read",
      "command:apply"
    ]);
    expect(() => validateCommandGrantScopes(["publish:execute"])).toThrow(
      expect.objectContaining({ code: "COMMAND_FORBIDDEN" })
    );
    expect(() => validateCommandGrantScopes(["admin:*"])).toThrow(
      expect.objectContaining({ code: "COMMAND_VALIDATION" })
    );
  });

  it("validates ChangeSet envelopes and rejects publish_external ops", () => {
    const envelope = validateCommandChangeSetEnvelope(validChangeSet());
    expect(envelope.ops[0]?.capability).toBe("create_or_update_collection");
    expect(envelope.resolved_post_ids).toHaveLength(2);

    expect(() =>
      validateCommandChangeSetEnvelope(validChangeSet({ created_at: "yesterday" }))
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));

    expect(() =>
      validateCommandChangeSetEnvelope(
        validChangeSet({
          ops: [
            {
              op_id: "op_pub",
              capability: "publish_external",
              risk_class: "publish_confirm",
              target_ids: ["post_ha_1"],
              payload: { destination: "x" }
            }
          ]
        })
      )
    ).toThrow(expect.objectContaining({ code: "COMMAND_FORBIDDEN" }));
  });
});
