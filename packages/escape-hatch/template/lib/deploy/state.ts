/**
 * Kit-local deploy state for Vercel golden-path rehearsal (EH-070).
 * Fixture/injectable only — productionSafe remains false.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";

export const DEPLOY_STATE_CONTRACT = "escape-hatch-deploy-state/1.0.0" as const;

export type DeployStatus =
  | "preview"
  | "approved"
  | "live"
  | "rolled_back"
  | "failed";

export type DeployRecord = {
  deployment_id: string;
  provider: "vercel";
  status: DeployStatus;
  preview_url: string;
  production_url: string | null;
  domain: string | null;
  created_at: string;
  promoted_at: string | null;
  rolled_back_at: string | null;
  build_duration_ms: number;
};

export type DeployStateDocument = {
  contract_version: typeof DEPLOY_STATE_CONTRACT;
  site_id: string;
  production_safe: false;
  updated_at: string;
  /** Active production pointer (fixture). */
  active_deployment_id: string | null;
  /** Prior stable retained for rollback. */
  previous_stable_deployment_id: string | null;
  deployments: DeployRecord[];
  last_rehearsal_at: string | null;
  last_error: string | null;
};

function statePath(kitDir: string): string {
  return join(kitDir, "data", "deploy-state.json");
}

export function emptyDeployState(siteId: string): DeployStateDocument {
  return {
    contract_version: DEPLOY_STATE_CONTRACT,
    site_id: siteId,
    production_safe: false,
    updated_at: new Date().toISOString(),
    active_deployment_id: null,
    previous_stable_deployment_id: null,
    deployments: [],
    last_rehearsal_at: null,
    last_error: null
  };
}

export function loadDeployState(
  siteId: string,
  kitDir = process.cwd()
): DeployStateDocument {
  const path = statePath(kitDir);
  if (!existsSync(path)) return emptyDeployState(siteId);
  try {
    const raw = JSON.parse(
      readFileSync(path, "utf8").replace(/^\uFEFF/, "")
    ) as Partial<DeployStateDocument>;
    if (
      raw.contract_version !== DEPLOY_STATE_CONTRACT ||
      !Array.isArray(raw.deployments)
    ) {
      return emptyDeployState(siteId);
    }
    return {
      contract_version: DEPLOY_STATE_CONTRACT,
      site_id: siteId,
      production_safe: false,
      updated_at:
        typeof raw.updated_at === "string"
          ? raw.updated_at
          : new Date().toISOString(),
      active_deployment_id:
        typeof raw.active_deployment_id === "string"
          ? raw.active_deployment_id
          : null,
      previous_stable_deployment_id:
        typeof raw.previous_stable_deployment_id === "string"
          ? raw.previous_stable_deployment_id
          : null,
      deployments: raw.deployments as DeployRecord[],
      last_rehearsal_at:
        typeof raw.last_rehearsal_at === "string"
          ? raw.last_rehearsal_at
          : null,
      last_error: typeof raw.last_error === "string" ? raw.last_error : null
    };
  } catch {
    return emptyDeployState(siteId);
  }
}

export function saveDeployState(
  doc: DeployStateDocument,
  kitDir = process.cwd()
): void {
  const normalized: DeployStateDocument = {
    ...doc,
    contract_version: DEPLOY_STATE_CONTRACT,
    production_safe: false,
    updated_at: new Date().toISOString()
  };
  mkdirSync(join(kitDir, "data"), { recursive: true });
  writeFileSync(
    statePath(kitDir),
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8"
  );
}

export function findDeployRecord(
  doc: DeployStateDocument,
  deploymentId: string
): DeployRecord | null {
  return doc.deployments.find((d) => d.deployment_id === deploymentId) ?? null;
}
