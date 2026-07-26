import browser from "../lib/browser";
import { MSG_DISTRIBUTION_FILL_RESULT } from "../lib/messages";

/** Per-image attach failure codes reported in distribution attempt fill_result. */
export type DistributionImageAttachFailureReason =
  | `fetch_failed:${string}`
  | "no_file_input"
  | "assign_failed"
  | "preview_not_detected";

export type DistributionImageAttachFailure = {
  filename: string;
  reason: DistributionImageAttachFailureReason;
};

/** Common fill_result fields for extension compose fills (stored as JSON on the attempt). */
export type DistributionComposeFillResult = {
  post_text_ok: boolean;
  images_attached: number;
  images_failed: string[];
  image_failures?: DistributionImageAttachFailure[];
  attach_method?: "compose_paste" | "file_input" | null;
  text_fill_mode?: "split" | "single";
  page_url: string;
};

export async function notifyDistributionFillResult(input: {
  attemptId: string | null;
  status: "fill_succeeded" | "fill_partial" | "fill_failed";
  fillResult: Record<string, unknown>;
  errorCode?: string | null;
  errorDetail?: string | null;
}): Promise<void> {
  if (!input.attemptId?.trim()) return;
  try {
    await browser.runtime.sendMessage({
      type: MSG_DISTRIBUTION_FILL_RESULT,
      attempt_id: input.attemptId.trim(),
      status: input.status,
      fill_result: input.fillResult,
      error_code: input.errorCode ?? null,
      error_detail: input.errorDetail ?? null
    });
  } catch {
    /* background may be unavailable */
  }
}

export async function readPendingAttemptId(): Promise<string | null> {
  const raw = await browser.storage.local.get("pending_cross_post_attempt_id");
  const id = raw.pending_cross_post_attempt_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}
