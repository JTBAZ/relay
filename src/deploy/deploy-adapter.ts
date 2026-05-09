/**
 * @fileoverview Provider adapter interface plus stub Vercel/Netlify implementations for deploy flows.
 * @description Real integrations would call external HTTP APIs; these classes simulate timelines locally.
 * @see ./types.js DeployProvider, Deployment, DnsCheckResult
 */

import { randomUUID } from "node:crypto";
import type { Deployment, DeployProvider, DnsCheckResult } from "./types.js";

/** @description Input for creating a new deployment artifact on a provider. */
export type DeployInput = {
  creator_id: string;
  site_id: string;
  domain?: string;
};

/**
 * @description Capabilities required of a hosting adapter.
 */
export type DeployAdapterInterface = {
  provider: DeployProvider;
  createDeployment(input: DeployInput): Promise<Deployment>;
  checkDns(domain: string): Promise<DnsCheckResult>;
  promote(deployment: Deployment): Promise<Deployment>;
  rollback(deployment: Deployment): Promise<Deployment>;
};

/**
 * @description Simulated Vercel-style lifecycle (preview DNS checks are naive heuristics).
 * @todo Replace with real Vercel API client and robust DNS verification.
 */
export class VercelAdapter implements DeployAdapterInterface {
  public readonly provider: DeployProvider = "vercel";

  /**
   * @description Creates a synthetic preview deployment row.
   * @param input Creator/site/domain hints.
   * @async
   */
  public async createDeployment(input: DeployInput): Promise<Deployment> {
    const buildStart = Date.now();
    const deploymentId = `dpl_${randomUUID()}`;
    return {
      deployment_id: deploymentId,
      creator_id: input.creator_id,
      site_id: input.site_id,
      provider: "vercel",
      status: "preview",
      domain: input.domain,
      preview_url: `https://${deploymentId}.vercel.app`,
      created_at: new Date().toISOString(),
      build_duration_ms: Date.now() - buildStart + 800
    };
  }

  /**
   * @description Placeholder DNS validation (non-empty domain passes).
   * @param domain Hostname under test.
   * @async
   */
  public async checkDns(domain: string): Promise<DnsCheckResult> {
    const issues: string[] = [];
    const hasCname = domain.length > 0;
    if (!hasCname) {
      issues.push("Domain is empty.");
    }
    return {
      domain,
      cname_valid: hasCname,
      ssl_ready: hasCname,
      issues
    };
  }

  /**
   * @description Marks deployment live and fills production URL.
   * @param deployment Mutable deployment snapshot.
   * @async
   */
  public async promote(deployment: Deployment): Promise<Deployment> {
    deployment.status = "live";
    deployment.launched_at = new Date().toISOString();
    deployment.production_url = deployment.domain
      ? `https://${deployment.domain}`
      : deployment.preview_url;
    return deployment;
  }

  /**
   * @description Marks deployment rolled back with timestamp.
   * @param deployment Mutable deployment snapshot.
   * @async
   */
  public async rollback(deployment: Deployment): Promise<Deployment> {
    deployment.status = "rolled_back";
    deployment.rolled_back_at = new Date().toISOString();
    return deployment;
  }
}

/**
 * @description Simulated Netlify deployment lifecycle (mirrors `VercelAdapter` shape).
 */
export class NetlifyAdapter implements DeployAdapterInterface {
  public readonly provider: DeployProvider = "netlify";

  /**
   * @description Creates a synthetic Netlify preview deployment.
   * @param input Deploy context.
   * @async
   */
  public async createDeployment(input: DeployInput): Promise<Deployment> {
    const deploymentId = `ntl_${randomUUID()}`;
    return {
      deployment_id: deploymentId,
      creator_id: input.creator_id,
      site_id: input.site_id,
      provider: "netlify",
      status: "preview",
      domain: input.domain,
      preview_url: `https://${deploymentId}--preview.netlify.app`,
      created_at: new Date().toISOString(),
      build_duration_ms: 600
    };
  }

  /**
   * @description Placeholder DNS validation.
   * @param domain Hostname under test.
   * @async
   */
  public async checkDns(domain: string): Promise<DnsCheckResult> {
    return {
      domain,
      cname_valid: domain.length > 0,
      ssl_ready: domain.length > 0,
      issues: domain.length === 0 ? ["Domain is empty."] : []
    };
  }

  /**
   * @description Promotes preview to live URLs.
   * @param deployment Mutable deployment snapshot.
   * @async
   */
  public async promote(deployment: Deployment): Promise<Deployment> {
    deployment.status = "live";
    deployment.launched_at = new Date().toISOString();
    deployment.production_url = deployment.domain
      ? `https://${deployment.domain}`
      : deployment.preview_url;
    return deployment;
  }

  /**
   * @description Marks deployment rolled back.
   * @param deployment Mutable deployment snapshot.
   * @async
   */
  public async rollback(deployment: Deployment): Promise<Deployment> {
    deployment.status = "rolled_back";
    deployment.rolled_back_at = new Date().toISOString();
    return deployment;
  }
}
