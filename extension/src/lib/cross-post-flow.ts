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
  | { ok: true; tab_id: number; relay_post_id: string; destination: CrossPostDestination }
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
  const destination = crossPostDestinationFromMessage(message);
  const fetched = await fetchAndStoreCrossPostPackageFromMessage(message);
  if (!fetched.ok) {
    return fetched;
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

  return {
    ok: true,
    tab_id: tabId,
    relay_post_id: fetched.relay_post_id,
    destination
  };
}

/** @deprecated Use {@link runRelayCrossPostFlow} with a full message. */
export async function runRelayCrossPostFlowForPost(relayPostId: string): Promise<CrossPostFlowResult> {
  return runRelayCrossPostFlow({ type: MSG_RELAY_CROSS_POST, relay_post_id: relayPostId });
}
