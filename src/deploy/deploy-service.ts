import type { CloneService } from "../clone/clone-service.js";
import type { DeployAdapterInterface } from "./deploy-adapter.js";
import type { FileDeployStore } from "./deploy-store.js";
import type { Deployment, DeployProvider, DnsCheckResult } from "./types.js";

export class DeployService {
  private readonly store: FileDeployStore;
  private readonly cloneService: CloneService;
  private readonly adapters: Map<string, DeployAdapterInterface>;

  public constructor(
    store: FileDeployStore,
    cloneService: CloneService,
    adapters: Map<string, DeployAdapterInterface>
  ) {
    this.store = store;
    this.cloneService = cloneService;
    this.adapters = adapters;
  }

  public async buildAndPreview(
    creatorId: string,
    provider: DeployProvider,
    domain?: string
  ): Promise<Deployment> {
    const site = await this.cloneService.getLatest(creatorId);
    if (!site) {
      throw new Error("No clone site generated. Run clone/generate first.");
    }

    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Deploy provider ${provider} not configured.`);
    }

    const deployment = await adapter.createDeployment({
      creator_id: creatorId,
      site_id: site.site_id,
      domain
    });

    await this.store.upsert(deployment);
    return deployment;
  }

  public async checkDns(
    deploymentId: string
  ): Promise<DnsCheckResult> {
    const dep = await this.store.get(deploymentId);
    if (!dep) throw new Error("Deployment not found.");
    if (!dep.domain) {
      return {
        domain: "",
        cname_valid: false,
        ssl_ready: false,
        issues: ["No domain configured for this deployment."]
      };
    }

    const adapter = this.adapters.get(dep.provider);
    if (!adapter) throw new Error(`Provider ${dep.provider} not configured.`);

    const result = await adapter.checkDns(dep.domain);
    dep.dns_check = result;
    await this.store.upsert(dep);
    return result;
  }

  public async approve(deploymentId: string): Promise<Deployment> {
    const dep = await this.store.get(deploymentId);
    if (!dep) throw new Error("Deployment not found.");
    if (dep.status !== "preview") {
      throw new Error(`Cannot approve deployment in status ${dep.status}.`);
    }
    dep.status = "approved";
    dep.approved_at = new Date().toISOString();
    await this.store.upsert(dep);
    return dep;
  }

  public async launch(deploymentId: string): Promise<Deployment> {
    const dep = await this.store.get(deploymentId);
    if (!dep) throw new Error("Deployment not found.");
    if (dep.status !== "approved") {
      throw new Error(`Cannot launch deployment in status ${dep.status}. Approve first.`);
    }

    const adapter = this.adapters.get(dep.provider);
    if (!adapter) throw new Error(`Provider ${dep.provider} not configured.`);

    const promoted = await adapter.promote(dep);
    await this.store.upsert(promoted);
    await this.store.setActive(dep.creator_id, dep.deployment_id);
    return promoted;
  }

  public async rollback(creatorId: string): Promise<Deployment> {
    const active = await this.store.getActive(creatorId);
    if (!active) throw new Error("No active deployment to roll back.");

    const adapter = this.adapters.get(active.provider);
    if (!adapter) throw new Error(`Provider ${active.provider} not configured.`);

    const rolledBack = await adapter.rollback(active);
    await this.store.upsert(rolledBack);

    const all = await this.store.listByCreator(creatorId);
    const previousLive = all.find(
      (d) =>
        d.deployment_id !== active.deployment_id &&
        (d.status === "live" || d.status === "rolled_back") &&
        d.launched_at
    );

    if (previousLive && previousLive.status === "rolled_back") {
      previousLive.status = "live";
      previousLive.launched_at = new Date().toISOString();
      await this.store.upsert(previousLive);
      await this.store.setActive(creatorId, previousLive.deployment_id);
    }

    return rolledBack;
  }

  public async getDeployment(deploymentId: string): Promise<Deployment | null> {
    return this.store.get(deploymentId);
  }

  public async getActive(creatorId: string): Promise<Deployment | null> {
    return this.store.getActive(creatorId);
  }

  public async listDeployments(creatorId: string): Promise<Deployment[]> {
    return this.store.listByCreator(creatorId);
  }
}
