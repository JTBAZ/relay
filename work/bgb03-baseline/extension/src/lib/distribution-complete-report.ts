import { RELAY_API_BASE } from "./constants";
import * as storage from "./storage";

export type DistributionCompleteReport = {
  attempt_id: string;
  status: "posted";
  external_url: string;
  external_id?: string | null;
};

export async function reportDistributionComplete(
  report: DistributionCompleteReport
): Promise<boolean> {
  const grant = await storage.getGrant();
  const attemptId = report.attempt_id.trim();
  const externalUrl = report.external_url.trim();
  if (!grant?.token.trim() || !attemptId || !externalUrl) return false;

  try {
    const res = await fetch(
      `${RELAY_API_BASE}/api/v1/relay/distribution-attempts/${encodeURIComponent(attemptId)}/complete`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${grant.token.trim()}`
        },
        body: JSON.stringify({
          status: report.status,
          external_url: externalUrl,
          external_id: report.external_id?.trim() || null
        })
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}
