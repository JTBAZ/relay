/**
 * Automations acceptance fixtures + AU → contract mapping (VS0 / B02).
 * Deterministic IDs for later slice tests — not live DB seed data.
 *
 * @see docs/qa/AUTOMATIONS_ACCEPTANCE.md
 * @see docs/studio/automation-build-plans/TRACEABILITY.md
 */

import type {
  AutomationApprovalContextWire,
  AutomationConnectorWire,
  AutomationRunHistoryWire,
  CreateAutomationBody
} from "../../src/autopost/automation-contract.js";
import {
  AUTOMATION_DEFAULT_APPROVAL_TTL_HOURS,
  AUTOMATION_CONTRACT_VERSION
} from "../../src/autopost/automation-contract.js";

/** QA persona: Autopost-eligible creator with DST-aware timezone. */
export const AUTOMATIONS_QA_PERSONA = {
  creator_id: "creator_automations_qa_001",
  account_id: "acct_automations_qa_001",
  display_name: "Automations QA Artist",
  timezone: "America/New_York",
  /** Spring-forward wall for AU-03 DST fixture (2026-03-08). */
  dst_transition_local_date: "2026-03-08",
  plan: "autopost" as const,
  linked_destinations: ["patreon", "x", "bluesky"] as const,
  campaign_id: "campaign_automations_qa_flagship",
  preview_template_id: "preview_tpl_automations_qa_001",
  /** Regression anchors — must remain untouched by automation creates. */
  legacy: {
    schedule_series_id: "series_legacy_post_draft_001",
    distribution_rule_id: "rule_legacy_delay_001",
    social_playbook_id: "playbook_legacy_001"
  }
} as const;

export const AUTOMATIONS_QA_POSTS = {
  newest_with_image: {
    post_id: "post_qa_newest_img",
    published_at: "2026-07-18T16:00:00.000Z",
    has_image_media: true,
    media_id: "media_qa_newest_main"
  },
  older_already_processed: {
    post_id: "post_qa_older_processed",
    published_at: "2026-07-11T16:00:00.000Z",
    has_image_media: true,
    media_id: "media_qa_older_main"
  },
  image_less_edge: {
    post_id: "post_qa_no_image",
    published_at: "2026-07-04T16:00:00.000Z",
    has_image_media: false,
    media_id: null
  }
} as const;

export type AutomationsAcceptanceId =
  | "AU-01"
  | "AU-02"
  | "AU-03"
  | "AU-04"
  | "AU-05"
  | "AU-06"
  | "AU-07"
  | "AU-08"
  | "AU-09"
  | "AU-10"
  | "AU-11"
  | "AU-12";

/**
 * Primary slice owner per AU (from TRACEABILITY.md).
 * Contract fixtures here only freeze vocabulary + sample wires for AU-02/11 create shapes.
 */
export const AUTOMATIONS_AU_TRACE: Record<
  AutomationsAcceptanceId,
  {
    primary_owner: string;
    contract_focus: string;
  }
> = {
  "AU-01": { primary_owner: "VS7", contract_focus: "feature flag + plan gate codes" },
  "AU-02": {
    primary_owner: "VS2",
    contract_focus: "preview_crosspost create + connector wire"
  },
  "AU-03": {
    primary_owner: "VS4",
    contract_focus: "automation_trigger materialization + schedule config"
  },
  "AU-04": { primary_owner: "VS4", contract_focus: "source_kind latest_patreon_post" },
  "AU-05": { primary_owner: "VS4", contract_focus: "AUTOMATION_NO_ELIGIBLE_POST / skip run" },
  "AU-06": {
    primary_owner: "VS3",
    contract_focus: "run history + approval context wires"
  },
  "AU-07": {
    primary_owner: "VS5",
    contract_focus: "remind_me + existing schedule_reminder:manual: packet"
  },
  "AU-08": {
    primary_owner: "VS6",
    contract_focus: "preview_template_id / snapshot (CreatorPreviewTemplate)"
  },
  "AU-09": {
    primary_owner: "VS6",
    contract_focus: "approval context blocks plan until preview_media_id"
  },
  "AU-10": {
    primary_owner: "VS4",
    contract_focus: "connector status + run expired/cancelled + TTL"
  },
  "AU-11": {
    primary_owner: "VS3",
    contract_focus: "delayed_public_release create + offset_days"
  },
  "AU-12": {
    primary_owner: "VS8",
    contract_focus: "legacy regression anchors + feature default off"
  }
};

export const AUTOMATIONS_CREATE_PREVIEW_CROSSPOST: CreateAutomationBody = {
  preset_kind: "preview_crosspost",
  title: "Thursday Preview & Crosspost",
  schedule: {
    cadence: "weekly",
    interval: 1,
    local_time: "10:00",
    timezone: AUTOMATIONS_QA_PERSONA.timezone,
    weekdays: [4],
    month_days: []
  },
  target_destinations: ["x", "bluesky"],
  preview_template_id: AUTOMATIONS_QA_PERSONA.preview_template_id,
  remind_me: true,
  approval_ttl_hours: AUTOMATION_DEFAULT_APPROVAL_TTL_HOURS,
  client_mutation_key: "mut_qa_create_preview_crosspost_001"
};

export const AUTOMATIONS_CREATE_DELAYED_RELEASE: CreateAutomationBody = {
  preset_kind: "delayed_public_release",
  title: "30-day public delay",
  offset_days: 30,
  target_destinations: ["x"],
  preview_template_id: AUTOMATIONS_QA_PERSONA.preview_template_id,
  remind_me: true,
  client_mutation_key: "mut_qa_create_delayed_001"
};

/** Sample connector wire after AU-02 create (IDs stable for fixture assertions). */
export const AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW: AutomationConnectorWire = {
  automation_id: "auto_qa_preview_001",
  creator_id: AUTOMATIONS_QA_PERSONA.creator_id,
  preset_kind: "preview_crosspost",
  status: "active",
  title: "Thursday Preview & Crosspost",
  source_kind: "latest_patreon_post",
  trigger_kind: "scheduled_occurrence",
  schedule: {
    cadence: "weekly",
    interval: 1,
    local_time: "10:00",
    timezone: AUTOMATIONS_QA_PERSONA.timezone,
    weekdays: [4],
    month_days: []
  },
  offset_days: null,
  target_destinations: ["x", "bluesky"],
  preview_template_id: AUTOMATIONS_QA_PERSONA.preview_template_id,
  schedule_series_id: "series_auto_trigger_qa_001",
  distribution_rule_id: "rule_auto_owned_qa_001",
  series_materialization_kind: "automation_trigger",
  approval_ttl_hours: AUTOMATION_DEFAULT_APPROVAL_TTL_HOURS,
  remind_me: true,
  version: 1,
  next_occurrence_at: "2026-07-23T14:00:00.000Z",
  latest_run_id: null,
  latest_run_status: null,
  created_at: "2026-07-20T12:00:00.000Z",
  updated_at: "2026-07-20T12:00:00.000Z"
};

export const AUTOMATIONS_SAMPLE_RUN_PENDING: AutomationRunHistoryWire = {
  run_id: "run_qa_pending_001",
  automation_id: AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.automation_id,
  creator_id: AUTOMATIONS_QA_PERSONA.creator_id,
  status: "pending",
  source_post_id: AUTOMATIONS_QA_POSTS.newest_with_image.post_id,
  schedule_occurrence_id: "occ_qa_2026_07_23",
  draft_id: "draft_qa_auto_001",
  materialized_event_id: "evt_qa_manual_001",
  plan_id: null,
  due_at: "2026-07-23T14:00:00.000Z",
  expires_at: "2026-07-26T14:00:00.000Z",
  idempotency_key: "occurrence:occ_qa_2026_07_23",
  failure_reason: null,
  created_at: "2026-07-23T14:00:01.000Z",
  updated_at: "2026-07-23T14:00:01.000Z",
  completed_at: null
};

export const AUTOMATIONS_SAMPLE_APPROVAL_CONTEXT: AutomationApprovalContextWire = {
  automation_id: AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.automation_id,
  run_id: AUTOMATIONS_SAMPLE_RUN_PENDING.run_id,
  draft_id: "draft_qa_auto_001",
  source_post_id: AUTOMATIONS_QA_POSTS.newest_with_image.post_id,
  source_media_id: AUTOMATIONS_QA_POSTS.newest_with_image.media_id,
  source_image_export_path: `/api/v1/export/media/${AUTOMATIONS_QA_PERSONA.creator_id}/media_qa_newest_main/content`,
  target_destinations: ["x", "bluesky"],
  preview_template_snapshot: {
    version: 1,
    layout: "single",
    crop: { x: 0, y: 0, w: 1, h: 1 }
  },
  preview_template_id: AUTOMATIONS_QA_PERSONA.preview_template_id,
  status: "pending",
  expires_at: AUTOMATIONS_SAMPLE_RUN_PENDING.expires_at,
  version: 1,
  existing_plan_id: null,
  existing_attempt_id: null
};

export function automationsFixtureManifest(): {
  contract_version: typeof AUTOMATION_CONTRACT_VERSION;
  persona_creator_id: string;
  acceptance_ids: AutomationsAcceptanceId[];
  legacy_ids: typeof AUTOMATIONS_QA_PERSONA.legacy;
} {
  return {
    contract_version: AUTOMATION_CONTRACT_VERSION,
    persona_creator_id: AUTOMATIONS_QA_PERSONA.creator_id,
    acceptance_ids: Object.keys(AUTOMATIONS_AU_TRACE) as AutomationsAcceptanceId[],
    legacy_ids: AUTOMATIONS_QA_PERSONA.legacy
  };
}

/** Frozen HTTP `data` payloads for route/UI consumers (VS2 / B06). */
export const AUTOMATIONS_API_FIXTURES = {
  list: { automations: [AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW] },
  get: { automation: AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW },
  create: {
    automation: AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW,
    receipt: {
      automation_id: AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.automation_id,
      version: 1,
      status: "active" as const,
      client_mutation_key: AUTOMATIONS_CREATE_PREVIEW_CROSSPOST.client_mutation_key ?? null,
      schedule_series_id: AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.schedule_series_id,
      distribution_rule_id: AUTOMATIONS_SAMPLE_CONNECTOR_PREVIEW.distribution_rule_id,
      created: true
    }
  },
  runs: { runs: [AUTOMATIONS_SAMPLE_RUN_PENDING] },
  paths: {
    collection: "/api/v1/creator/autopost/automations",
    item: (id: string) => `/api/v1/creator/autopost/automations/${id}`,
    runs: (id: string) => `/api/v1/creator/autopost/automations/${id}/runs`,
    approvalContext: (automationId: string, runId: string) =>
      `/api/v1/creator/autopost/automations/${automationId}/runs/${runId}/approval-context`
  }
} as const;
