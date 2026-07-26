/**
 * @fileoverview Canonical space-separated OAuth scope string for creator Patreon authorize (`oauth2/authorize`).
 * @description Keep aligned with `PATREON_CREATOR_OAUTH_SCOPES` in `web/lib/patreon-creator-scopes.ts` (Next.js connect URL).
 *
 * Mapping to v2 usage in-repo:
 * - `identity` — resource owner basics
 * - `campaigns` — `GET /v2/campaigns`
 * - `campaigns.posts` — campaigns posts paging + single-post fetch
 * - `campaigns.members` — member roster (`syncMembers`)
 * - `campaigns.members[email]` — email field privilege on members
 * - `w:campaigns.webhook` — webhook CRUD via oauth2 webhook API
 * @see {@link ../jsdoc-core-entities.ts}
 * @see {@link https://docs.patreon.com/}
 */
export const PATREON_CREATOR_OAUTH_SCOPES =
  "identity campaigns campaigns.posts campaigns.members campaigns.members[email] w:campaigns.webhook";
