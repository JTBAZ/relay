import { randomUUID } from "node:crypto";
import type { Deployment, DeployProvider, DnsCheckResult } from "./types.js";

export type DeployInput = {
  creator_id: string;
  site_id: string;
  domain?: string;
};

export type DeployAdapterInterface = {
  provider: DeployProvider;
  createDeployment(input: DeployInput): Promise<Deployment>;
  checkDns(domain: string): Promise<DnsCheckResult>;
  promote(deployment: Deployment): Promise<Deployment>;
  rollback(deployment: Deployment): Promise<Deployment>;
};

export class VercelAdapter implements DeployAdapterInterface {
  public readonly provider: DeployProvider = "vercel";

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

  public async promote(deployment: Deployment): Promise<Deployment> {
    deployment.status = "live";
    deployment.launched_at = new Date().toISOString();
    deployment.production_url = deployment.domain
      ? `https://${deployment.domain}`
      : deployment.preview_url;
    return deployment;
  }

  public async rollback(deployment: Deployment): Promise<Deployment> {
    deployment.status = "rolled_back";
    deployment.rolled_back_at = new Date().toISOString();
    return deployment;
  }
}

export class NetlifyAdapter implements DeployAdapterInterface {
  public readonly provider: DeployProvider = "netlify";

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

  public async checkDns(domain: string): Promise<DnsCheckResult> {
    return {
      domain,
      cname_valid: domain.length > 0,
      ssl_ready: domain.length > 0,
      issues: domain.length === 0 ? ["Domain is empty."] : []
    };
  }

  public async promote(deployment: Deployment): Promise<Deployment> {
    deployment.status = "live";
    deployment.launched_at = new Date().toISOString();
    deployment.production_url = deployment.domain
      ? `https://${deployment.domain}`
      : deployment.preview_url;
    return deployment;
  }

  public async rollback(deployment: Deployment): Promise<Deployment> {
    deployment.status = "rolled_back";
    deployment.rolled_back_at = new Date().toISOString();
    return deployment;
  }
}
