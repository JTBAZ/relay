export type DeployProvider = "vercel" | "netlify";

export type DeploymentStatus =
  | "building"
  | "preview"
  | "approved"
  | "live"
  | "rolled_back"
  | "failed";

export type DnsCheckResult = {
  domain: string;
  cname_valid: boolean;
  ssl_ready: boolean;
  issues: string[];
};

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

export type DeployStoreRoot = {
  deployments: Record<string, Deployment>;
  active_by_creator: Record<string, string>;
};
