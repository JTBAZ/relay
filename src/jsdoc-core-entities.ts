/**
 * @fileoverview Canonical JSDoc typedefs for core Relay domain entities and common external row shapes.
 * @description Consumption: documentation generators, IDE tooling, and AI/DevOps metadata. This module re-exports nothing at runtime beyond an empty export to keep it a valid ES module.
 * @see prisma/schema.prisma Target relational model / Supabase mapping
 * @see {@link https://docs.patreon.com/} Patreon API documentation
 */

export {};

/**
 * @typedef {Object} Artist
 * @description Creator-facing identity: Patreon campaign linkage, public slug, and Supabase auth binding. Owns tiers, posts, and gallery presentation.
 * @property {string} [tenant_id] Multi-tenant partition key; required for Supabase RLS on artist-owned rows.
 * @property {string} [user_id] Supabase Auth `sub`; links browser sessions to creator tools.
 * @property {string} [patreon_campaign_id] External campaign id used in OAuth, ingest, and webhooks.
 * @property {string} [slug] Public profile path segment (visitor-safe).
 * @property {string} [display_name] Shown name; may sync from Patreon.
 * @property {string} [email] PII; honor retention and export/deletion flows.
 */

/**
 * @typedef {Object} Gallery
 * @description Visitor or patron-visible gallery: layout, assets, publish state, and entitlement hints.
 * @property {string} [tenant_id] Owning scope for layout and media rows (`tenant_id` RLS).
 * @property {string} [gallery_id] Stable identifier for a layout instance or collection root.
 * @property {string[]} [post_ids] Ordered post identifiers for grid/carousel synthesis.
 * @property {Record<string, unknown>} [layout_json] Versioned layout document (designer/editor DSL).
 * @property {Date|string|null} [published_at] When the layout became publicly readable.
 * @property {string} [creator_user_id] Owning creator for ACL checks alongside `tenant_id`.
 */

/**
 * @typedef {Object} SyncStatus
 * @description Ingest/sync operational state: watermarks, health, and last error for Patreon or internal pipelines.
 * @property {string} [tenant_id] Scope for cursors when sync is per-artist or per-campaign.
 * @property {string} [resource] Logical stream (e.g. members, posts, pledges, webhooks).
 * @property {string|null} [cursor] Opaque Patreon pagination or internal checkpoint.
 * @property {Date|string|null} [last_success_at] Last fully successful run.
 * @property {Date|string|null} [last_error_at] Last failure instant.
 * @property {string|null} [last_error_message] Sanitized operator-facing summary.
 * @property {boolean} [healthy] Derived health bit from sync health stores.
 */

/**
 * @typedef {Object} PatreonJsonApiResource
 * @description Minimal Patreon JSON:API `data[]` element; attributes and relationships vary by `type`.
 * @property {string} id
 * @property {string} type
 * @property {Record<string, unknown>} [attributes]
 * @property {Record<string, { data?: { id: string, type: string } | Array<{ id: string, type: string }> }>} [relationships]
 */

/**
 * @typedef {Object} PatreonJsonApiDocument
 * @description Top-level Patreon API JSON:API envelope.
 * @property {PatreonJsonApiResource|PatreonJsonApiResource[]} [data]
 * @property {PatreonJsonApiResource[]} [included]
 * @property {Record<string, unknown>} [meta]
 * @property {Record<string, unknown>} [links]
 */

/**
 * @typedef {Object} SupabaseTenantScopedRow
 * @description Base fields expected on tenant-isolated tables in Supabase (conceptual; verify per migration).
 * @property {string} id Row primary key.
 * @property {string} tenant_id Tenant scope for RLS.
 * @property {string} [created_at] ISO timestamp.
 * @property {string} [updated_at] ISO timestamp.
 */
