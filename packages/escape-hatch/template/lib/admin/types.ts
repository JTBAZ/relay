/**
 * Admin attention marks (EH-022) — local-prototype operator notes only.
 * Not authentication, entitlements, or production CMS state.
 */

export const ADMIN_ATTENTION_CONTRACT_VERSION =
  "admin-attention/1.0.0" as const;

export type AdminAttentionState = {
  contract_version: typeof ADMIN_ATTENTION_CONTRACT_VERSION;
  site_id: string;
  /** production_safe is always false for this surface. */
  production_safe: false;
  updated_at: string;
  /** post_id → attention note (creator-facing label). */
  marks: Record<string, { note: string; marked_at: string }>;
};

export type AdapterHealthRow = {
  id: string;
  implementation: string;
  ok: boolean;
  detail: string;
};

export type AdminMediaRow = {
  media_id: string;
  mime_type?: string;
  access_class: string;
  has_export?: boolean;
  content_path?: string;
  /** From migration ledger when present. */
  ledger_status?: string;
  private_required?: boolean;
  private_read_verified?: boolean;
  failure_reason?: string;
  /** True when only public/media is known — never claim private-verified. */
  public_media_only: boolean;
};

export type AdminTierRow = {
  tier_id: string;
  title: string;
  access_level: string;
  post_count: number;
  amount_cents?: number | null;
  retired?: boolean;
  benefit_copy?: string | null;
  /** Unmapped when no posts and no amount_cents identity (preview honesty). */
  mapping_warning?: string;
};
