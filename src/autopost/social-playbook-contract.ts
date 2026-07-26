/**
 * Frozen wire contracts for follow-up Social Playbooks (Autopost).
 * Templates compose atomic actions that map onto existing schedule event types
 * and Autopost drafts — Coach/LLM may select templates + validated overrides only.
 *
 * @see docs/studio/PLAN_MANUAL_SOCIAL_EVENTS.md
 */

import type { CreatorScheduleEventTypeWire } from "../distribution/creator-schedule-event-contract.js";

export const SOCIAL_PLAYBOOK_TEMPLATE_VERSION = 1 as const;

export const SOCIAL_PLAYBOOK_ACTION_KEYS = [
  "reply_block",
  "pin_cta_comment",
  "repost",
  "highlight_fan",
  "cta_banner",
  "follow_up_post",
  "engagement_check"
] as const;

export type SocialPlaybookActionKey = (typeof SOCIAL_PLAYBOOK_ACTION_KEYS)[number];

export const SOCIAL_PLAYBOOK_TEMPLATE_KEYS = [
  "launch_boost",
  "community_vibe",
  "new_product_update",
  "evergreen_resurface"
] as const;

export type SocialPlaybookTemplateKey = (typeof SOCIAL_PLAYBOOK_TEMPLATE_KEYS)[number];

export const SOCIAL_PLAYBOOK_EXECUTION_MODES = ["reminder", "draft"] as const;

export type SocialPlaybookExecutionMode = (typeof SOCIAL_PLAYBOOK_EXECUTION_MODES)[number];

export const SOCIAL_PLAYBOOK_PLANNED_FORMATS = ["text", "image", "video", "mixed"] as const;

export type SocialPlaybookPlannedFormat = (typeof SOCIAL_PLAYBOOK_PLANNED_FORMATS)[number];

/** Destination policy for an atom relative to the Make a Post anchor. */
export type SocialPlaybookDestinationPolicy = "anchor_primary" | "anchor_all";

export type SocialPlaybookAtomDefinition = {
  action_key: SocialPlaybookActionKey;
  /** Display label in timeline preview. */
  label: string;
  execution_mode: SocialPlaybookExecutionMode;
  /**
   * Persisted exact event type for reminder atoms.
   * Draft atoms materialize as make_post Autopost drafts.
   */
  event_type: CreatorScheduleEventTypeWire;
  planned_format?: SocialPlaybookPlannedFormat;
  destination_policy: SocialPlaybookDestinationPolicy;
  /** Minutes after anchor due_at. */
  offset_minutes: number;
  default_title: string;
  default_note: string;
  /** 1-based order within the template. */
  step_index: number;
};

export type SocialPlaybookTemplateDefinition = {
  template_key: SocialPlaybookTemplateKey;
  version: typeof SOCIAL_PLAYBOOK_TEMPLATE_VERSION;
  label: string;
  description: string;
  atoms: readonly SocialPlaybookAtomDefinition[];
};

export type SocialPlaybookTemplateWire = {
  template_key: SocialPlaybookTemplateKey;
  version: number;
  label: string;
  description: string;
  atoms: Array<{
    action_key: SocialPlaybookActionKey;
    label: string;
    execution_mode: SocialPlaybookExecutionMode;
    event_type: CreatorScheduleEventTypeWire;
    planned_format: SocialPlaybookPlannedFormat | null;
    destination_policy: SocialPlaybookDestinationPolicy;
    offset_minutes: number;
    default_title: string;
    default_note: string;
    step_index: number;
  }>;
};

export type SocialPlaybookStepOverride = {
  /** 1-based step index from the template. */
  step_index: number;
  enabled?: boolean;
  title?: string;
  note?: string | null;
};

export type ApplySocialPlaybookBody = {
  template_key: SocialPlaybookTemplateKey;
  /** Anchor Make a Post due_at (ISO). Offsets resolve from this. */
  anchor_due_at: string;
  anchor_post_id: string;
  /** Primary Postbot task / rail event id from create. */
  anchor_task_id?: string | null;
  /** Primary destination for reminder atoms. */
  destination: "patreon" | "x" | "deviantart" | "bluesky";
  destinations?: Array<"patreon" | "x" | "deviantart" | "bluesky">;
  remind_me?: boolean;
  /** Disable or retitle individual atoms. */
  step_overrides?: SocialPlaybookStepOverride[];
};

export type SocialPlaybookStepWire = {
  step_id: string;
  step_index: number;
  action_key: SocialPlaybookActionKey;
  execution_mode: SocialPlaybookExecutionMode;
  event_type: CreatorScheduleEventTypeWire;
  planned_format: SocialPlaybookPlannedFormat | null;
  offset_minutes: number;
  title: string;
  note: string | null;
  due_at: string;
  enabled: boolean;
  status: string;
  materialized_event_id: string | null;
  materialized_task_id: string | null;
  materialized_draft_id: string | null;
  materialized_post_id: string | null;
};

export type SocialPlaybookRunWire = {
  run_id: string;
  creator_id: string;
  template_key: SocialPlaybookTemplateKey;
  template_version: number;
  label: string;
  status: string;
  anchor_post_id: string;
  anchor_task_id: string | null;
  anchor_due_at: string;
  destination: string;
  remind_me: boolean;
  steps: SocialPlaybookStepWire[];
  created_at: string;
  updated_at: string;
};

export function isSocialPlaybookActionKey(v: unknown): v is SocialPlaybookActionKey {
  return (
    typeof v === "string" &&
    (SOCIAL_PLAYBOOK_ACTION_KEYS as readonly string[]).includes(v)
  );
}

export function isSocialPlaybookTemplateKey(v: unknown): v is SocialPlaybookTemplateKey {
  return (
    typeof v === "string" &&
    (SOCIAL_PLAYBOOK_TEMPLATE_KEYS as readonly string[]).includes(v)
  );
}

/** Resolve absolute due_at from anchor + offset minutes. */
export function resolvePlaybookDueAt(anchorDueAt: Date, offsetMinutes: number): Date {
  return new Date(anchorDueAt.getTime() + offsetMinutes * 60_000);
}
