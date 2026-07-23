/**
 * Injectable Vercel golden-path rehearsal (EH-070).
 * No live Vercel network — fixture timeline only.
 */

import { randomBytes } from "node:crypto";
import {
  findDeployRecord,
  loadDeployState,
  saveDeployState,
  type DeployRecord,
  type DeployStateDocument
} from "./state";
import {
  buildCallbackChecklist,
  classifyDomainMode,
  normalizePublicOrigin,
  type CallbackChecklist
} from "./callbacks";

export type VercelDeployClient = {
  createPreview(input: {
    siteId: string;
    domain?: string | null;
  }): Promise<{
    deployment_id: string;
    preview_url: string;
    build_duration_ms: number;
  }>;
};

export function createMemoryVercelClient(): VercelDeployClient {
  return {
    async createPreview(input) {
      const id = `dpl_${randomBytes(8).toString("hex")}`;
      const host = input.domain?.trim()
        ? null
        : `${id}.vercel.app`;
      return {
        deployment_id: id,
        preview_url: host
          ? `https://${host}`
          : `https://${id}.vercel.app`,
        build_duration_ms: 850
      };
    }
  };
}

export type CreatePreviewResult =
  | { ok: true; record: DeployRecord; state: DeployStateDocument }
  | { ok: false; reason: string };

export async function createVercelPreview(opts: {
  siteId: string;
  domain?: string | null;
  kitDir?: string;
  client?: VercelDeployClient;
}): Promise<CreatePreviewResult> {
  const kitDir = opts.kitDir ?? process.cwd();
  const client = opts.client ?? createMemoryVercelClient();
  const created = await client.createPreview({
    siteId: opts.siteId,
    domain: opts.domain
  });
  const now = new Date().toISOString();
  const domain = opts.domain?.trim() || null;
  const record: DeployRecord = {
    deployment_id: created.deployment_id,
    provider: "vercel",
    status: "preview",
    preview_url: created.preview_url,
    production_url: null,
    domain,
    created_at: now,
    promoted_at: null,
    rolled_back_at: null,
    build_duration_ms: created.build_duration_ms
  };
  const state = loadDeployState(opts.siteId, kitDir);
  state.deployments = [record, ...state.deployments].slice(0, 50);
  state.last_rehearsal_at = now;
  state.last_error = null;
  saveDeployState(state, kitDir);
  return { ok: true, record, state };
}

export type PromoteResult =
  | { ok: true; record: DeployRecord; state: DeployStateDocument }
  | { ok: false; reason: string };

export function promoteVercelDeployment(opts: {
  siteId: string;
  deploymentId: string;
  kitDir?: string;
  siteUrl?: string | null;
}): PromoteResult {
  const kitDir = opts.kitDir ?? process.cwd();
  const state = loadDeployState(opts.siteId, kitDir);
  const idx = state.deployments.findIndex(
    (d) => d.deployment_id === opts.deploymentId
  );
  if (idx < 0) return { ok: false, reason: "deployment_not_found" };
  const current = state.deployments[idx]!;
  if (current.status !== "preview" && current.status !== "approved") {
    return { ok: false, reason: "not_promotable" };
  }

  const origin =
    normalizePublicOrigin(opts.siteUrl) ??
    (current.domain ? `https://${current.domain}` : null) ??
    current.preview_url;

  const previous = state.active_deployment_id;
  const record: DeployRecord = {
    ...current,
    status: "live",
    production_url: origin,
    promoted_at: new Date().toISOString()
  };
  state.deployments[idx] = record;
  if (previous && previous !== record.deployment_id) {
    state.previous_stable_deployment_id = previous;
  }
  state.active_deployment_id = record.deployment_id;
  state.last_rehearsal_at = new Date().toISOString();
  state.last_error = null;
  saveDeployState(state, kitDir);
  return { ok: true, record, state };
}

export type RollbackResult =
  | { ok: true; record: DeployRecord; restored: DeployRecord | null; state: DeployStateDocument }
  | { ok: false; reason: string };

/**
 * Mark active deployment rolled_back and restore previous stable pointer when present.
 */
export function rollbackVercelDeployment(opts: {
  siteId: string;
  deploymentId?: string | null;
  kitDir?: string;
}): RollbackResult {
  const kitDir = opts.kitDir ?? process.cwd();
  const state = loadDeployState(opts.siteId, kitDir);
  const targetId =
    opts.deploymentId?.trim() || state.active_deployment_id;
  if (!targetId) return { ok: false, reason: "no_active_deployment" };

  const idx = state.deployments.findIndex(
    (d) => d.deployment_id === targetId
  );
  if (idx < 0) return { ok: false, reason: "deployment_not_found" };

  const record: DeployRecord = {
    ...state.deployments[idx]!,
    status: "rolled_back",
    rolled_back_at: new Date().toISOString()
  };
  state.deployments[idx] = record;

  const priorId = state.previous_stable_deployment_id;
  let restored: DeployRecord | null = null;
  if (priorId) {
    const prior = findDeployRecord(state, priorId);
    if (prior) {
      restored = {
        ...prior,
        status: "live",
        rolled_back_at: null
      };
      const pIdx = state.deployments.findIndex(
        (d) => d.deployment_id === priorId
      );
      if (pIdx >= 0) state.deployments[pIdx] = restored;
      state.active_deployment_id = priorId;
      state.previous_stable_deployment_id = null;
    } else {
      state.active_deployment_id = null;
    }
  } else {
    state.active_deployment_id = null;
  }

  state.last_rehearsal_at = new Date().toISOString();
  state.last_error = null;
  saveDeployState(state, kitDir);
  return { ok: true, record, restored, state };
}

export type DeployReadiness = {
  path: "manifest" | "vercel_rehearsal";
  ok: boolean;
  detail: string;
  active_deployment_id: string | null;
  previous_stable_deployment_id: string | null;
  domain_mode: ReturnType<typeof classifyDomainMode>;
  callbacks: CallbackChecklist;
  production_safe: false;
};

export function assessVercelDeployReadiness(opts: {
  siteId: string;
  siteUrl?: string | null;
  kitDir?: string;
}): DeployReadiness {
  const kitDir = opts.kitDir ?? process.cwd();
  const state = loadDeployState(opts.siteId, kitDir);
  const callbacks = buildCallbackChecklist(opts.siteUrl);
  const origin = normalizePublicOrigin(opts.siteUrl ?? null);
  const domain_mode = classifyDomainMode(origin);

  const active = state.active_deployment_id
    ? findDeployRecord(state, state.active_deployment_id)
    : null;

  if (active?.status === "live") {
    return {
      path: "vercel_rehearsal",
      ok: true,
      detail: `Fixture Vercel rehearsal live at ${active.production_url ?? active.preview_url} — not a live Vercel API deploy; productionSafe remains false.`,
      active_deployment_id: state.active_deployment_id,
      previous_stable_deployment_id: state.previous_stable_deployment_id,
      domain_mode,
      callbacks,
      production_safe: false
    };
  }

  return {
    path: "manifest",
    ok: false,
    detail:
      "No fixture production pointer — vercel.json is present but does not prove a healthy deploy. Run /admin/deploy rehearsal or a live Vercel promote outside the kit.",
    active_deployment_id: state.active_deployment_id,
    previous_stable_deployment_id: state.previous_stable_deployment_id,
    domain_mode,
    callbacks,
    production_safe: false
  };
}
