/**
 * @fileoverview Orchestrates clone-backed preview builds, DNS checks, approvals, launches, and rollbacks.
 * @description Delegates provider operations to `DeployAdapterInterface` implementations and persists via `DeployStore`.
 * @see ../clone/clone-service.js
 * @see ./deploy-store.js
 */

import type { CloneService } from "../clone/clone-service.js";
import type { DeployAdapterInterface } from "./deploy-adapter.js";
import type { DeployStore } from "./deploy-store.js";
import type { Deployment, DeployProvider, DnsCheckResult } from "./types.js";

/**
 * @description Application façade over deploy storage and third-party adapters (simulated or real).
 * @security-audit-required All entrypoints are creator-scoped; HTTP must verify operator authorization.
 */
export class DeployService {
  private readonly store: DeployStore;
  private readonly cloneService: CloneService;
  private readonly adapters: Map<string, DeployAdapterInterface>;

  /**
   * @param store Deployment persistence.
   * @param cloneService Source of latest clone site graph.
   * @param adapters Map of provider key → adapter implementation.
   */
  public constructor(
    store: DeployStore,
    cloneService: CloneService,
    adapters: Map<string, DeployAdapterInterface>
  ) {
    this.store = store;
    this.cloneService = cloneService;
    this.adapters = adapters;
  }

  /**
   * @description Loads latest clone site, requests provider preview deployment, persists record.
   * @param creatorId Creator scope.
   * @param provider Target host.
   * @param domain Optional custom domain hint.
   * @returns New deployment in `preview` state.
   * @async
   * @throws {Error} Missing clone site, missing adapter, or adapter/store failures.
   */
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

  /**
   * @description Runs provider DNS probe, mutates deployment `dns_check`, persists.
   * @param deploymentId Target deployment id.
   * @returns DNS evaluation payload.
   * @async
   * @throws {Error} Deployment missing, adapter missing, or `checkDns` failure.
   */
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

  /**
   * @description Marks a preview deployment approved for launch.
   * @param deploymentId Deployment id.
   * @returns Updated deployment.
   * @async
   * @throws {Error} Invalid state transitions or missing row.
   */
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

  /**
   * @description Promotes approved deployment via adapter and pins active pointer.
   * @param deploymentId Deployment id.
   * @returns Live deployment envelope from adapter.
   * @async
   * @throws {Error} State/adapter/store failures.
   */
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

  /**
   * @description Rolls back active deployment and optionally revives prior live revision (best-effort).
   * @param creatorId Creator scope.
   * @returns Rolled back deployment envelope from adapter.
   * @async
   * @throws {Error} When no active deployment or adapter unavailable.
   */
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

  /**
   * @description Loads deployment by id.
   * @param deploymentId Deployment id.
   * @async
   * @throws {Error} Store read failures propagate.
   */
  public async getDeployment(deploymentId: string): Promise<Deployment | null> {
    return this.store.get(deploymentId);
  }

  /**
   * @description Resolves active deployment for creator.
   * @param creatorId Creator scope.
   * @async
   */
  public async getActive(creatorId: string): Promise<Deployment | null> {
    return this.store.getActive(creatorId);
  }

  /**
   * @description Lists deployments for creator via store.
   * @param creatorId Creator scope.
   * @async
   */
  public async listDeployments(creatorId: string): Promise<Deployment[]> {
    return this.store.listByCreator(creatorId);
  }
}
