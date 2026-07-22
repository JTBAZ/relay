/**
 * Typed adapter surfaces for the generated kit (EH-030).
 * Stub adapters remain for unset env; Supabase implementations activate when configured.
 */

import type { SiteAuthSession } from "../identity/types";

export type AdapterHealth =
  | { ok: true; detail?: string }
  | { ok: false; reason: string };

export type AuthProvider = {
  readonly id: "auth";
  readonly implementation: "stub" | "supabase" | "portable";
  health(): Promise<AdapterHealth>;
  /** Null when unset, unsigned, or outside a request context. */
  getSession(siteId?: string): Promise<SiteAuthSession | null>;
};

export type DatabaseProvider = {
  readonly id: "database";
  readonly implementation: "stub" | "postgres" | "supabase";
  health(): Promise<AdapterHealth>;
  /**
   * Apply forward migrations. Live runners apply SQL under db/migrations
   * when DATABASE_URL is real; otherwise documents apply-via-dashboard path.
   */
  migrate(): Promise<{ applied: string[]; skipped: boolean; reason?: string }>;
};

export type StorageProvider = {
  readonly id: "storage";
  readonly implementation: "stub" | "r2" | "local_private";
  health(): Promise<AdapterHealth>;
  /**
   * Mint a short-lived signed GET URL for a private object key (EH-033).
   * Stub / misconfigured private_r2 returns url: null (fail closed).
   */
  signGetObject(
    key: string
  ): Promise<{ url: string | null; expiresAt?: string; reason?: string }>;
};

export type BillingProvider = {
  readonly id: "billing";
  readonly implementation: "stub" | "stripe";
  health(): Promise<AdapterHealth>;
};

export type PatreonVerificationProvider = {
  readonly id: "patreon";
  readonly implementation: "stub" | "creator_oauth" | "relay_managed";
  health(): Promise<AdapterHealth>;
};

export type TransactionalEmailProvider = {
  readonly id: "email";
  readonly implementation: "stub";
  health(): Promise<AdapterHealth>;
};

export type DeploymentProvider = {
  readonly id: "deployment";
  readonly implementation: "manifest" | "vercel" | "docker";
  /** Declares supported targets from escape-hatch.manifest.json — not a live deploy. */
  listTargets(): ReadonlyArray<"vercel" | "docker">;
  health(): Promise<AdapterHealth>;
};

export type SiteAdapters = {
  auth: AuthProvider;
  database: DatabaseProvider;
  storage: StorageProvider;
  billing: BillingProvider;
  patreon: PatreonVerificationProvider;
  email: TransactionalEmailProvider;
  deployment: DeploymentProvider;
};
