/**
 * Schedule Rail Automations — dedicated web client (VS2 / B06).
 * Do not fold into autopost-routines-api / relay-api mega-modules.
 *
 * @see docs/studio/automation-build-plans/03-VS2-LIFECYCLE-API.md
 */
import { relayFetch } from "@/lib/relay-api";

export type AutomationPresetKind = "preview_crosspost" | "delayed_public_release";
export type AutomationConnectorStatus = "active" | "paused" | "archived";
export type AutomationDestination = "patreon" | "x" | "deviantart" | "bluesky";

export type AutomationScheduleConfig = {
  cadence: "weekly" | "monthly";
  interval: number;
  local_time: string;
  timezone: string;
  weekdays: number[];
  month_days: number[];
};

export type AutomationConnectorWire = {
  automation_id: string;
  creator_id: string;
  preset_kind: AutomationPresetKind;
  status: AutomationConnectorStatus;
  title: string;
  source_kind: string;
  trigger_kind: string;
  schedule: AutomationScheduleConfig | null;
  offset_days: number | null;
  target_destinations: AutomationDestination[];
  preview_template_id: string | null;
  schedule_series_id: string | null;
  distribution_rule_id: string;
  series_materialization_kind: string | null;
  approval_ttl_hours: number;
  remind_me: boolean;
  version: number;
  next_occurrence_at: string | null;
  latest_run_id: string | null;
  latest_run_status: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationMutationReceiptWire = {
  automation_id: string;
  version: number;
  status: AutomationConnectorStatus;
  client_mutation_key: string | null;
  schedule_series_id: string | null;
  distribution_rule_id: string;
  created: boolean;
};

export type AutomationRunHistoryWire = {
  run_id: string;
  automation_id: string;
  creator_id: string;
  status: string;
  source_post_id: string | null;
  schedule_occurrence_id: string | null;
  draft_id: string | null;
  materialized_event_id: string | null;
  plan_id: string | null;
  due_at: string;
  expires_at: string | null;
  idempotency_key: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type CreateAutomationBody = {
  preset_kind: AutomationPresetKind;
  title?: string | null;
  schedule?: Partial<AutomationScheduleConfig> | null;
  offset_days?: number | null;
  target_destinations: AutomationDestination[];
  preview_template_id?: string | null;
  remind_me?: boolean;
  approval_ttl_hours?: number;
  client_mutation_key?: string | null;
};

export type PatchAutomationBody = {
  version: number;
  status?: "active" | "paused" | "archived";
  title?: string | null;
  schedule?: Partial<AutomationScheduleConfig> | null;
  offset_days?: number | null;
  target_destinations?: AutomationDestination[];
  preview_template_id?: string | null;
  remind_me?: boolean;
  approval_ttl_hours?: number;
};

export type AutomationMutationResult = {
  automation: AutomationConnectorWire;
  receipt: AutomationMutationReceiptWire;
};

const BASE = "/api/v1/creator/autopost/automations";

export async function listAutomations(): Promise<AutomationConnectorWire[]> {
  const out = await relayFetch<{ automations: AutomationConnectorWire[] }>(BASE);
  return out.automations ?? [];
}

export async function getAutomation(
  automationId: string
): Promise<AutomationConnectorWire> {
  const out = await relayFetch<{ automation: AutomationConnectorWire }>(
    `${BASE}/${encodeURIComponent(automationId)}`
  );
  return out.automation;
}

export async function createAutomation(
  body: CreateAutomationBody
): Promise<AutomationMutationResult> {
  return relayFetch<AutomationMutationResult>(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function patchAutomation(
  automationId: string,
  body: PatchAutomationBody
): Promise<AutomationMutationResult> {
  return relayFetch<AutomationMutationResult>(
    `${BASE}/${encodeURIComponent(automationId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
}

/** Archive semantics (DELETE) — retains history. */
export async function archiveAutomation(
  automationId: string
): Promise<AutomationMutationResult & { archived: boolean }> {
  return relayFetch<AutomationMutationResult & { archived: boolean }>(
    `${BASE}/${encodeURIComponent(automationId)}`,
    { method: "DELETE" }
  );
}

export async function listAutomationRuns(
  automationId: string
): Promise<AutomationRunHistoryWire[]> {
  const out = await relayFetch<{ runs: AutomationRunHistoryWire[] }>(
    `${BASE}/${encodeURIComponent(automationId)}/runs`
  );
  return out.runs ?? [];
}
