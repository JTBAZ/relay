/**
 * Injectable Docker Path B golden-path rehearsal (EH-071).
 * No live Docker daemon — fixture timeline only.
 */

import { randomBytes } from "node:crypto";
import {
  loadDeployState,
  saveDeployState,
  type DeployRecord,
  type DeployStateDocument
} from "./state";
import { promoteVercelDeployment, rollbackVercelDeployment } from "./vercel-path";

export type DockerDeployClient = {
  buildAndUp(input: {
    siteId: string;
    domain?: string | null;
  }): Promise<{
    deployment_id: string;
    preview_url: string;
    image_tag: string;
    build_duration_ms: number;
  }>;
};

export function createMemoryDockerClient(): DockerDeployClient {
  return {
    async buildAndUp(input) {
      const id = `img_${randomBytes(8).toString("hex")}`;
      const host = input.domain?.trim()
        ? input.domain.trim()
        : `${id}.localhost`;
      return {
        deployment_id: id,
        preview_url: `https://${host}`,
        image_tag: `escape-hatch:${id.slice(0, 12)}`,
        build_duration_ms: 1200
      };
    }
  };
}

export type CreateDockerPreviewResult =
  | { ok: true; record: DeployRecord; state: DeployStateDocument }
  | { ok: false; reason: string };

/** Fixture: image build + compose up → preview pointer (no daemon). */
export async function createDockerPreview(opts: {
  siteId: string;
  domain?: string | null;
  kitDir?: string;
  client?: DockerDeployClient;
}): Promise<CreateDockerPreviewResult> {
  const kitDir = opts.kitDir ?? process.cwd();
  const client = opts.client ?? createMemoryDockerClient();
  const created = await client.buildAndUp({
    siteId: opts.siteId,
    domain: opts.domain
  });
  const now = new Date().toISOString();
  const domain = opts.domain?.trim() || null;
  const record: DeployRecord = {
    deployment_id: created.deployment_id,
    provider: "docker",
    status: "preview",
    preview_url: created.preview_url,
    production_url: null,
    domain,
    created_at: now,
    promoted_at: null,
    rolled_back_at: null,
    build_duration_ms: created.build_duration_ms,
    notes: `compose.path-b + ${created.image_tag}`
  };
  const state = loadDeployState(opts.siteId, kitDir);
  state.deployments = [record, ...state.deployments].slice(0, 50);
  state.last_rehearsal_at = now;
  state.last_error = null;
  saveDeployState(state, kitDir);
  return { ok: true, record, state };
}

/** Promote a Docker (or any) preview — shared pointer semantics with EH-070. */
export function promoteDockerDeployment(opts: {
  siteId: string;
  deploymentId: string;
  kitDir?: string;
  siteUrl?: string | null;
}) {
  return promoteVercelDeployment(opts);
}

/** Rollback — shared with EH-070. */
export function rollbackDockerDeployment(opts: {
  siteId: string;
  deploymentId?: string | null;
  kitDir?: string;
}) {
  return rollbackVercelDeployment(opts);
}
