import { relayFetch, relayRequest, RelayApiError } from "@/lib/relay-api";
import type {
  Destination,
  ExactEventType,
  ScheduleData,
  ScheduleEvent,
  ScheduleRailCue,
} from "@/lib/schedule-rail-data";

export type ScheduleRailApiResponse = ScheduleData & {
  today_day: number;
  days_in_month: number;
  armed: boolean;
  cue: ScheduleRailCue | null;
};

export async function fetchScheduleRail(params?: {
  month?: string;
}): Promise<ScheduleRailApiResponse> {
  const qs = params?.month?.trim()
    ? `?month=${encodeURIComponent(params.month.trim())}`
    : "";
  const out = await relayFetch<{ rail: ScheduleRailApiResponse }>(
    `/api/v1/creator/schedule-rail${qs}`
  );
  return out.rail;
}

export type CreateScheduledPostBody = {
  title?: string;
  scheduled_for: string;
  destination?: Destination;
  destinations?: Destination[];
  notify?: boolean;
  note?: string;
  planned_format?: "text" | "image" | "video" | "mixed";
};

export async function createScheduledPost(
  body: CreateScheduledPostBody
): Promise<ScheduleEvent> {
  const out = await relayFetch<{ event: ScheduleEvent }>(
    "/api/v1/creator/schedule-rail/scheduled-posts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  return out.event;
}

export type CreateManualScheduleEventBody = {
  event_type: ExactEventType;
  destination?: NonNullable<Destination> | null;
  destinations?: NonNullable<Destination>[];
  due_at: string;
  title?: string;
  note?: string | null;
  remind_me?: boolean;
  post_id?: string | null;
  external_url?: string | null;
  target_mode?: "new_post" | "existing_post" | "external_url";
  create_relay_draft?: boolean;
  planned_format?: "text" | "image" | "video" | "mixed";
};

export type MissingPlatformLinkError = {
  error: "missing_platform_link";
  post_id: string;
  destination: NonNullable<Destination>;
  message: string;
};

export class MissingPlatformLinkApiError extends Error {
  public override readonly name = "MissingPlatformLinkApiError";
  public readonly post_id: string;
  public readonly destination: NonNullable<Destination>;
  constructor(payload: MissingPlatformLinkError) {
    super(payload.message);
    this.post_id = payload.post_id;
    this.destination = payload.destination;
  }
}

export async function createManualScheduleEvent(
  body: CreateManualScheduleEventBody
): Promise<ScheduleEvent> {
  const res = await relayRequest("/api/v1/creator/schedule-rail/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      throw new RelayApiError("Invalid JSON from schedule event create.", res.status);
    }
  }
  if (res.status === 409 && json && typeof json === "object") {
    const row = json as Record<string, unknown>;
    if (row.error === "missing_platform_link") {
      throw new MissingPlatformLinkApiError({
        error: "missing_platform_link",
        post_id: String(row.post_id ?? ""),
        destination: row.destination as NonNullable<Destination>,
        message: String(row.message ?? "Missing platform link."),
      });
    }
  }
  if (res.status === 402 && json && typeof json === "object") {
    const row = json as { error?: string; required_plan?: string };
    throw new RelayApiError(
      row.error === "plan_required"
        ? `Plan required: ${row.required_plan ?? "studio_core"}`
        : "Plan required",
      402,
      "plan_required"
    );
  }
  if (!res.ok) {
    const err = json as { error?: { message?: string; code?: string } };
    throw new RelayApiError(
      err?.error?.message ?? res.statusText,
      res.status,
      err?.error?.code
    );
  }
  const envelope = json as { data: { event: ScheduleEvent } };
  return envelope.data.event;
}

export type PatchManualScheduleEventBody = {
  title?: string;
  note?: string | null;
  due_at?: string;
  remind_me?: boolean;
  status?: "pending" | "done" | "dismissed";
  external_url?: string | null;
};

export async function patchManualScheduleEvent(
  eventId: string,
  body: PatchManualScheduleEventBody
): Promise<ScheduleEvent> {
  const out = await relayFetch<{ event: ScheduleEvent }>(
    `/api/v1/creator/schedule-rail/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  return out.event;
}

export type LibraryPostPickerRow = {
  post_id: string;
  title: string;
  published_at: string | null;
  destinations: Array<{
    destination: NonNullable<Destination>;
    has_url: boolean;
  }>;
};

export async function fetchScheduleLibraryPosts(params?: {
  q?: string;
}): Promise<LibraryPostPickerRow[]> {
  const qs = params?.q?.trim() ? `?q=${encodeURIComponent(params.q.trim())}` : "";
  const out = await relayFetch<{ posts: LibraryPostPickerRow[] }>(
    `/api/v1/creator/schedule-rail/library-posts${qs}`
  );
  return out.posts;
}

export type AttachScheduleRailMediaMode = "append" | "replace" | "remove";

export type AttachScheduleRailMediaResult = {
  task_id: string;
  post_id: string;
  needs_media: boolean;
  media_count: number;
  media_ids: string[];
  media_state?: string;
  readiness_errors?: string[];
  mode?: AttachScheduleRailMediaMode;
};

export async function attachScheduleRailMedia(
  taskId: string,
  mediaIds: string[],
  options?: { mode?: AttachScheduleRailMediaMode }
): Promise<AttachScheduleRailMediaResult> {
  const mode = options?.mode ?? "append";
  const out = await relayFetch<{ attach: AttachScheduleRailMediaResult }>(
    `/api/v1/creator/schedule-rail/events/${encodeURIComponent(taskId)}/attach-media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_ids: mode === "remove" ? [] : mediaIds,
        mode
      }),
    }
  );
  return out.attach;
}

export type PostDetailsFitMode = "as_written" | "fit_platforms";

export type ScheduleRailPostDetailsVariant = {
  destination: string;
  title: string | null;
  body_text: string | null;
  post_text: string | null;
  tags: string[];
  adapted: boolean;
};

export type ScheduleRailPostDetailsResult = {
  task_id: string;
  post_id: string;
  title: string;
  description: string | null;
  tags: string[];
  post_details_state: "authored" | "adapted";
  variants: ScheduleRailPostDetailsVariant[];
  preview: boolean;
};

export type UpdateScheduleRailPostDetailsBody = {
  title?: string | null;
  description?: string | null;
  tags?: string[];
  fit_mode?: PostDetailsFitMode;
  preview?: boolean;
  variant_overrides?: Array<{
    destination: string;
    use_original?: boolean;
    title?: string | null;
    body_text?: string | null;
    post_text?: string | null;
  }>;
};

export async function updateScheduleRailPostDetails(
  eventId: string,
  body: UpdateScheduleRailPostDetailsBody
): Promise<ScheduleRailPostDetailsResult> {
  const out = await relayFetch<{ post_details: ScheduleRailPostDetailsResult }>(
    `/api/v1/creator/schedule-rail/events/${encodeURIComponent(eventId)}/post-details`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  return out.post_details;
}
