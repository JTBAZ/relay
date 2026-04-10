import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { DeployStore } from "./deploy-store.js";
import type { Deployment, DnsCheckResult } from "./types.js";

function rowToDeployment(row: {
  deploymentId: string;
  creatorId: string;
  siteId: string;
  provider: string;
  status: string;
  domain: string | null;
  previewUrl: string;
  productionUrl: string | null;
  dnsCheck: Prisma.JsonValue | null;
  createdAt: Date;
  approvedAt: Date | null;
  launchedAt: Date | null;
  rolledBackAt: Date | null;
  rollbackFromId: string | null;
  buildDurationMs: number | null;
}): Deployment {
  const d: Deployment = {
    deployment_id: row.deploymentId,
    creator_id: row.creatorId,
    site_id: row.siteId,
    provider: row.provider as Deployment["provider"],
    status: row.status as Deployment["status"],
    preview_url: row.previewUrl,
    created_at: row.createdAt.toISOString()
  };
  if (row.domain) {
    d.domain = row.domain;
  }
  if (row.productionUrl) {
    d.production_url = row.productionUrl;
  }
  if (row.dnsCheck !== null && row.dnsCheck !== undefined) {
    d.dns_check = row.dnsCheck as DnsCheckResult;
  }
  if (row.approvedAt) {
    d.approved_at = row.approvedAt.toISOString();
  }
  if (row.launchedAt) {
    d.launched_at = row.launchedAt.toISOString();
  }
  if (row.rolledBackAt) {
    d.rolled_back_at = row.rolledBackAt.toISOString();
  }
  if (row.rollbackFromId) {
    d.rollback_from_id = row.rollbackFromId;
  }
  if (row.buildDurationMs != null) {
    d.build_duration_ms = row.buildDurationMs;
  }
  return d;
}

function deploymentToCreateInput(dep: Deployment): Prisma.DeploymentUncheckedCreateInput {
  return {
    deploymentId: dep.deployment_id,
    creatorId: dep.creator_id,
    siteId: dep.site_id,
    provider: dep.provider,
    status: dep.status,
    domain: dep.domain ?? null,
    previewUrl: dep.preview_url,
    productionUrl: dep.production_url ?? null,
    dnsCheck:
      dep.dns_check === undefined
        ? undefined
        : (dep.dns_check as unknown as Prisma.InputJsonValue),
    createdAt: new Date(dep.created_at),
    approvedAt: dep.approved_at ? new Date(dep.approved_at) : null,
    launchedAt: dep.launched_at ? new Date(dep.launched_at) : null,
    rolledBackAt: dep.rolled_back_at ? new Date(dep.rolled_back_at) : null,
    rollbackFromId: dep.rollback_from_id ?? null,
    buildDurationMs: dep.build_duration_ms ?? null
  };
}

export class DbDeployStore implements DeployStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async upsert(deployment: Deployment): Promise<void> {
    const data = deploymentToCreateInput(deployment);
    await this.prisma.deployment.upsert({
      where: { deploymentId: deployment.deployment_id },
      create: data,
      update: {
        creatorId: data.creatorId,
        siteId: data.siteId,
        provider: data.provider,
        status: data.status,
        domain: data.domain,
        previewUrl: data.previewUrl,
        productionUrl: data.productionUrl,
        dnsCheck: data.dnsCheck ?? undefined,
        createdAt: data.createdAt,
        approvedAt: data.approvedAt,
        launchedAt: data.launchedAt,
        rolledBackAt: data.rolledBackAt,
        rollbackFromId: data.rollbackFromId,
        buildDurationMs: data.buildDurationMs
      }
    });
  }

  public async get(deploymentId: string): Promise<Deployment | null> {
    const row = await this.prisma.deployment.findUnique({
      where: { deploymentId }
    });
    return row ? rowToDeployment(row) : null;
  }

  public async setActive(creatorId: string, deploymentId: string): Promise<void> {
    await this.prisma.creatorActiveDeployment.upsert({
      where: { creatorId },
      create: { creatorId, deploymentId },
      update: { deploymentId }
    });
  }

  public async getActive(creatorId: string): Promise<Deployment | null> {
    const active = await this.prisma.creatorActiveDeployment.findUnique({
      where: { creatorId }
    });
    if (!active) {
      return null;
    }
    return this.get(active.deploymentId);
  }

  public async listByCreator(creatorId: string): Promise<Deployment[]> {
    const rows = await this.prisma.deployment.findMany({
      where: { creatorId },
      orderBy: { createdAt: "desc" }
    });
    return rows.map(rowToDeployment);
  }
}
