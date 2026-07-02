import browser from "../lib/browser";
import { MSG_DISTRIBUTION_FILL_RESULT } from "../lib/messages";

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
