import { relayFetch } from "@/lib/relay-api";

export type SocialPlaybookTemplateKey =
  | "launch_boost"
  | "community_vibe"
  | "new_product_update"
  | "evergreen_resurface";

export type SocialPlaybookActionKey =
  | "reply_block"
  | "pin_cta_comment"
  | "repost"
  | "highlight_fan"
  | "cta_banner"
  | "follow_up_post"
  | "engagement_check";

export type SocialPlaybookAtomWire = {
  action_key: SocialPlaybookActionKey;
  label: string;
  execution_mode: "reminder" | "draft";
  event_type: string;
  planned_format: string | null;
  destination_policy: string;
  offset_minutes: number;
  default_title: string;
  default_note: string;
  step_index: number;
};

export type SocialPlaybookTemplateWire = {
  template_key: SocialPlaybookTemplateKey;
  version: number;
  label: string;
  description: string;
  atoms: SocialPlaybookAtomWire[];
};

export type SocialPlaybookStepOverride = {
  step_index: number;
  enabled?: boolean;
  title?: string;
  note?: string | null;
};

export type ApplySocialPlaybookBody = {
  template_key: SocialPlaybookTemplateKey;
  anchor_due_at: string;
  anchor_post_id: string;
  anchor_task_id?: string | null;
  destination: "patreon" | "x" | "deviantart" | "bluesky";
  destinations?: Array<"patreon" | "x" | "deviantart" | "bluesky">;
  remind_me?: boolean;
  step_overrides?: SocialPlaybookStepOverride[];
};

export type SocialPlaybookRunWire = {
  run_id: string;
  template_key: SocialPlaybookTemplateKey;
  label: string;
  status: string;
  anchor_post_id: string;
  steps: Array<{
    step_id: string;
    step_index: number;
    action_key: SocialPlaybookActionKey;
    title: string;
    due_at: string;
    enabled: boolean;
    status: string;
  }>;
};

export async function fetchSocialPlaybookTemplates(): Promise<SocialPlaybookTemplateWire[]> {
  const out = await relayFetch<{ templates: SocialPlaybookTemplateWire[] }>(
    "/api/v1/creator/autopost/social-playbooks/templates"
  );
  return out.templates ?? [];
}

export async function applySocialPlaybookRun(
  body: ApplySocialPlaybookBody
): Promise<SocialPlaybookRunWire> {
  const out = await relayFetch<{ run: SocialPlaybookRunWire }>(
    "/api/v1/creator/autopost/social-playbooks/runs",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  return out.run;
}

export function formatPlaybookOffsetLabel(offsetMinutes: number): string {
  if (offsetMinutes < 60) return `+${offsetMinutes}m`;
  if (offsetMinutes < 24 * 60) {
    const h = Math.round(offsetMinutes / 60);
    return `+${h}h`;
  }
  const d = Math.round(offsetMinutes / (24 * 60));
  return `+${d}d`;
}

export function resolvePlaybookTimelineIso(
  anchorDueAt: string,
  offsetMinutes: number
): string {
  const anchor = new Date(anchorDueAt);
  return new Date(anchor.getTime() + offsetMinutes * 60_000).toISOString();
}
