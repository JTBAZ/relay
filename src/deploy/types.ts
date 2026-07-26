/**
 * @fileoverview Domain types for static deploy workflows (Vercel/Netlify adapters and DNS checks).
 * @see prisma/schema.prisma Deployment, CreatorActiveDeployment
 */

/** @description Supported third-party deploy targets. */
export type DeployProvider = "vercel" | "netlify";

/** @description Deployment lifecycle for UI and automation. */
export type DeploymentStatus =
  | "building"
  | "preview"
  | "approved"
  | "live"
  | "rolled_back"
  | "failed";

/** @description Result of a DNS + SSL readiness probe. */
export type DnsCheckResult = {
  domain: string;
  cname_valid: boolean;
  ssl_ready: boolean;
  issues: string[];
};

/**
 * @description Single deployment snapshot stored in file or DB adapters.
 * @security-audit-required Includes creator/site correlation; restrict listing to authorized operators.
 */
export type Deployment = {
  deployment_id: string;
  creator_id: string;
  site_id: string;
  provider: DeployProvider;
  status: DeploymentStatus;
  domain?: string;
  preview_url: string;
  production_url?: string;
  dns_check?: DnsCheckResult;
  created_at: string;
  approved_at?: string;
  launched_at?: string;
  rolled_back_at?: string;
  rollback_from_id?: string;
  build_duration_ms?: number;
};

/** @description JSON file layout pairing deployment records with active pointers. */
export type DeployStoreRoot = {
  deployments: Record<string, Deployment>;
  active_by_creator: Record<string, string>;
};
