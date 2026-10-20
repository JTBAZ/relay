import { RELAY_API_BASE } from "./constants";
import * as storage from "./storage";

export type DistributionFillReport = {
  attempt_id: string;
  status: "fill_succeeded" | "fill_partial" | "fill_failed";
  fill_result: Record<string, unknown>;
  extension_tab_id?: number | null;
  error_code?: string | null;
  error_detail?: string | null;
};

export async function reportDistributionFillResult(
  report: DistributionFillReport
): Promise<void> {
  const grant = await storage.getGrant();
  if (!grant?.token.trim() || !report.attempt_id.trim()) return;
  try {
    await fetch(
      `${RELAY_API_BASE}/api/v1/relay/distribution-attempts/${encodeURIComponent(report.attempt_id)}/fill-result`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${grant.token.trim()}`
        },
        body: JSON.stringify({
          status: report.status,
          fill_result: report.fill_result,
          extension_tab_id: report.extension_tab_id ?? null,
          error_code: report.error_code ?? null,
          error_detail: report.error_detail ?? null
        })
      }
    );
  } catch {
    /* best-effort */
  }
}

export async function readAttemptIdFromPendingPackage(): Promise<string | null> {
  return storage.getPendingCrossPostAttemptId();
}
