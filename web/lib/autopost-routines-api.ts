import { relayFetch } from "@/lib/relay-api";

export type ScheduleSeriesWire = {
  series_id: string;
  creator_id: string;
  status: string;
  cadence: string;
  interval: number;
  local_time: string;
  timezone: string;
  weekdays: number[];
  month_days: number[];
  planned_format: string;
  destinations: string[];
  remind_me: boolean;
  title_hint: string | null;
  starts_at: string;
  ends_at: string | null;
  source_post_id: string | null;
  /** post_draft (ordinary routine) | automation_trigger (Automations calendar ticks). */
  materialization_kind?: "post_draft" | "automation_trigger";
  last_error: string | null;
  next_occurrence_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateScheduleSeriesBody = {
  cadence: "weekly" | "monthly";
  interval?: number;
  local_time: string;
  timezone?: string;
  weekdays?: number[];
  month_days?: number[];
  planned_format?: string;
  destinations: string[];
  remind_me?: boolean;
  title_hint?: string | null;
  starts_at?: string;
  ends_at?: string | null;
  source_post_id?: string | null;
  materialization_kind?: "post_draft" | "automation_trigger";
  seed?: {
    due_at: string;
    post_id?: string | null;
    draft_id?: string | null;
    primary_task_id?: string | null;
  };
};

export type PatchScheduleSeriesBody = {
  status?: "active" | "paused" | "ended";
  cadence?: "weekly" | "monthly";
  interval?: number;
  local_time?: string;
  timezone?: string;
  weekdays?: number[];
  month_days?: number[];
  planned_format?: string;
  destinations?: string[];
  remind_me?: boolean;
  title_hint?: string | null;
  ends_at?: string | null;
  delete_future?: boolean;
};

export type DistributionRuleWire = {
  rule_id: string;
  creator_id: string;
  status: string;
  trigger_kind: string;
  offset_days: number;
  target_destinations: string[];
  transform_mode: string;
  remind_me: boolean;
  draft_only: boolean;
  title: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type DistributionRuleRunWire = {
  run_id: string;
  rule_id: string;
  source_post_id: string;
  source_published_at: string;
  due_at: string;
  status: string;
  draft_id: string | null;
  plan_id: string | null;
  failure_reason: string | null;
};

export async function listScheduleSeries(): Promise<ScheduleSeriesWire[]> {
  const out = await relayFetch<{ series: ScheduleSeriesWire[] }>(
    "/api/v1/creator/autopost/schedule-series"
  );
  return out.series ?? [];
}

export async function createScheduleSeries(
  body: CreateScheduleSeriesBody
): Promise<ScheduleSeriesWire> {
  const out = await relayFetch<{ series: ScheduleSeriesWire[] } | { series: ScheduleSeriesWire }>(
    "/api/v1/creator/autopost/schedule-series",
    { method: "POST", body: JSON.stringify(body) }
  );
  return (out as { series: ScheduleSeriesWire }).series;
}

export async function patchScheduleSeries(
  seriesId: string,
  body: PatchScheduleSeriesBody
): Promise<ScheduleSeriesWire> {
  const out = await relayFetch<{ series: ScheduleSeriesWire }>(
    `/api/v1/creator/autopost/schedule-series/${encodeURIComponent(seriesId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
  return out.series;
}

export async function deleteScheduleSeries(
  seriesId: string,
  options?: { delete_future_only?: boolean }
): Promise<{ deleted: boolean; ended: boolean }> {
  const q = options?.delete_future_only ? "?delete_future_only=1" : "";
  return relayFetch(
    `/api/v1/creator/autopost/schedule-series/${encodeURIComponent(seriesId)}${q}`,
    { method: "DELETE" }
  );
}

export async function materializeScheduleOccurrence(
  occurrenceId: string
): Promise<{ occurrence_id: string; draft_id: string | null }> {
  const out = await relayFetch<{
    occurrence: { occurrence_id: string; draft_id: string | null };
  }>(
    `/api/v1/creator/autopost/schedule-series/occurrences/${encodeURIComponent(occurrenceId)}/materialize`,
    { method: "POST", body: "{}" }
  );
  return out.occurrence;
}

export async function listDistributionRules(): Promise<DistributionRuleWire[]> {
  const out = await relayFetch<{ rules: DistributionRuleWire[] }>(
    "/api/v1/creator/autopost/distribution-rules"
  );
  return out.rules ?? [];
}

export async function createDistributionRule(body: {
  offset_days?: number;
  target_destinations: string[];
  remind_me?: boolean;
  title?: string | null;
}): Promise<DistributionRuleWire> {
  const out = await relayFetch<{ rule: DistributionRuleWire }>(
    "/api/v1/creator/autopost/distribution-rules",
    { method: "POST", body: JSON.stringify(body) }
  );
  return out.rule;
}

export async function patchDistributionRule(
  ruleId: string,
  body: {
    status?: "active" | "paused";
    offset_days?: number;
    target_destinations?: string[];
    remind_me?: boolean;
    title?: string | null;
  }
): Promise<DistributionRuleWire> {
  const out = await relayFetch<{ rule: DistributionRuleWire }>(
    `/api/v1/creator/autopost/distribution-rules/${encodeURIComponent(ruleId)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
  return out.rule;
}

export async function deleteDistributionRule(ruleId: string): Promise<void> {
  await relayFetch(
    `/api/v1/creator/autopost/distribution-rules/${encodeURIComponent(ruleId)}`,
    { method: "DELETE" }
  );
}

export async function listDistributionRuleRuns(
  ruleId: string
): Promise<DistributionRuleRunWire[]> {
  const out = await relayFetch<{ runs: DistributionRuleRunWire[] }>(
    `/api/v1/creator/autopost/distribution-rules/${encodeURIComponent(ruleId)}/runs`
  );
  return out.runs ?? [];
}
