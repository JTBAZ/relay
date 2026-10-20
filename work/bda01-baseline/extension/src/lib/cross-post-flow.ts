import { fetchAndStoreCrossPostPackageFromMessage } from "./cross-post-fetch";
import {
  injectCrossPostFillScript,
  openCrossPostTab,
  waitForCrossPostTabReady
} from "./cross-post-tab-inject";
import {
  crossPostDestinationFromMessage,
  MSG_RELAY_CROSS_POST,
  type CrossPostDestination,
  type ExternalCrossPostMessage
} from "./cross-post-types";

export type CrossPostFlowResult =
  | { ok: true; tab_id: number; relay_post_id: string; destination: CrossPostDestination; schedule_event_id?: never }
  | { ok: true; tab_id: number; relay_post_id: string; destination: "x"; schedule_event_id: string }
  | { ok: true; tab_id: number; relay_post_id: string; destination: "x"; handoff_id: string }
  | {
      ok: false;
      reason:
        | "invalid_message"
        | "not_connected"
        | "grant_revoked"
        | "package_fetch_failed"
        | "tab_open_failed"
        | "tab_load_timeout"
        | "inject_failed";
      detail?: string;
    };

/** Fetch package, open destination compose UI, inject fill script. */
export async function runRelayCrossPostFlow(
  message: ExternalCrossPostMessage
): Promise<CrossPostFlowResult> {
  if ("handoff_id" in message) return runBenchXHandoffFlow(message);
  const requestedDestination = crossPostDestinationFromMessage(message);
  const fetched = await fetchAndStoreCrossPostPackageFromMessage(message);
  if (!fetched.ok) {
    return fetched;
  }
  let destination = requestedDestination;
  let checkedScheduleEventId: string | undefined;
  if ("schedule_event_id" in message) {
    if (!("schedule_event_id" in fetched) || fetched.schedule_event_id !== message.schedule_event_id || fetched.destination !== "x" || requestedDestination !== "x") {
      return { ok: false, reason: "package_fetch_failed", detail: "event_mismatch" };
    }
    checkedScheduleEventId = fetched.schedule_event_id;
    destination = fetched.destination;
  }

  let tabId: number;
  try {
    const opened = await openCrossPostTab(destination);
    if (opened === undefined) {
      return { ok: false, reason: "tab_open_failed" };
    }
    tabId = opened;
  } catch {
    return { ok: false, reason: "tab_open_failed" };
  }

  try {
    await waitForCrossPostTabReady(tabId, destination);
  } catch {
    return { ok: false, reason: "tab_load_timeout" };
  }

  const injected = await injectCrossPostFillScript(tabId, destination);
  if (!injected) {
    return { ok: false, reason: "inject_failed" };
  }

  if ("schedule_event_id" in message) {
    if (!checkedScheduleEventId) return { ok: false, reason: "package_fetch_failed", detail: "event_mismatch" };
    return { ok: true, tab_id: tabId, relay_post_id: fetched.relay_post_id, destination: "x", schedule_event_id: checkedScheduleEventId };
  }
  return { ok: true, tab_id: tabId, relay_post_id: fetched.relay_post_id, destination };
}

async function runBenchXHandoffFlow(message: Extract<ExternalCrossPostMessage, { handoff_id: string }>): Promise<CrossPostFlowResult> {
  const fetched = await fetchAndStoreCrossPostPackageFromMessage(message);
  if (!fetched.ok) return fetched;
  if (!("handoff_id" in fetched) || fetched.handoff_id !== message.handoff_id || fetched.destination !== "x") return { ok: false, reason: "package_fetch_failed", detail: "handoff_mismatch" };
  let tabId: number;
  try {
    const opened = await openCrossPostTab("x");
    if (opened === undefined) return { ok: false, reason: "tab_open_failed" };
    tabId = opened;
  } catch { return { ok: false, reason: "tab_open_failed" }; }
  try { await waitForCrossPostTabReady(tabId, "x"); } catch { return { ok: false, reason: "tab_load_timeout" }; }
  const injected = await injectCrossPostFillScript(tabId, "x", fetched.packet);
  if (!injected) return { ok: false, reason: "inject_failed" };
  return { ok: true, tab_id: tabId, relay_post_id: fetched.relay_post_id, destination: "x", handoff_id: fetched.handoff_id };
}

/** @deprecated Use {@link runRelayCrossPostFlow} with a full message. */
export async function runRelayCrossPostFlowForPost(relayPostId: string): Promise<CrossPostFlowResult> {
  return runRelayCrossPostFlow({ type: MSG_RELAY_CROSS_POST, relay_post_id: relayPostId });
}
